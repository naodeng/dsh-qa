import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const rpcContract = fs.readFileSync(path.join(root, 'public/dsh-rpc-contract.js'), 'utf8');
const readText = relativePath => {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
};
const readJson = relativePath => {
  const text = readText(relativePath);
  return text ? JSON.parse(text) : {};
};
const packageManifest = readJson('package.json');
const qaPreset = readText('preset/qa/cordis.patch.yml');
const qualityControlManifest = readJson('preset/quality-control/package.json');
const qualityControlPreset = readText('preset/quality-control/cordis.patch.yml');
const qaInstaller = readText('scripts/install-qa-preset.sh');
const qualityControlInstaller = readText('scripts/install-quality-control-preset.sh');
const hostConfig = readText('test/playwright.host.config.js');
const source = `${app}\n${rpcContract}`;

test('DSH integration uses current slash RPC namespaces instead of retired API Proxy methods', () => {
  for (const retired of [
    'agentPreset.list', 'agentPreset.select', 'session.list', 'session.models',
    'session.create', 'session.rename', 'skill.list', 'session.history',
    'session.prompt', 'session.cancel', 'session.selectModel',
  ]) {
    assert.equal(source.includes(retired), false, `retired DSH RPC method remains: ${retired}`);
  }
  for (const current of [
    'agentPresets/list', 'agentPresets/select', 'session/list', 'session/create',
    'session/rename', 'session/modelCatalog', 'session/selectModel', 'session/prompt',
    'session/cancel', 'skills/list', 'commands/list', 'commands/execute', 'session/follow',
  ]) {
    assert.equal(source.includes(current), true, `current DSH RPC endpoint is missing: ${current}`);
  }
  for (const retired of ['snapshotEvents', 'eventAt', 'ownEvents']) {
    assert.equal(source.includes(retired), false, `deprecated follow field remains: ${retired}`);
  }
});

test('DSH Remote UI and implementation are absent', () => {
  for (const removed of ['btn-remote', 'openRemotePanel', 'refreshRemoteStatus', 'remoteStatusView', 'remote: { status:']) {
    assert.equal(app.includes(removed), false, `removed Remote integration remains: ${removed}`);
  }
});

test('DSH capability failures remain visible instead of becoming empty success', () => {
  assert.equal(app.includes('Promise.allSettled'), false, 'DSH capability failures are silently downgraded');
  assert.match(app, /const \[skillResult, commandResult\] = await Promise\.all\(/);
});

test('QA preset uses the supported PTC workflow engine package', () => {
  assert.equal(
    qaPreset.includes('@deepseek-ai/dsh-workflow-worker-thread'),
    false,
    'QA preset still references the removed worker-thread workflow package',
  );
  assert.match(qaPreset, /- id: workflow-ptc\n\s+name: '@deepseek-ai\/dsh-workflow-ptc'/);
});

test('QA preset uses the current persona config schema', () => {
  assert.match(qaPreset, /- id: persona\n\s+name: '@deepseek-ai\/dsh-persona'\n\s+config:\n\s+prefix:/);
  assert.doesNotMatch(qaPreset, /^(\s+)text:/m, 'QA persona still uses the retired text config key');
});

test('Harness 0.1.7 main bundle declares the QA preset instead of a directory preset', () => {
  assert.deepEqual(packageManifest.dsh?.bundle?.patch, [
    './cordis.patch.yml',
    './preset/qa/cordis.patch.yml',
  ]);
  assert.match(qaPreset, /- id: preset-qa\n\s+name: '@deepseek-ai\/dsh-agent-preset'/);
  assert.match(qaPreset, /config:\n\s+id: qa[\s\S]*?order: 5[\s\S]*?plugins:/);
  assert.doesNotMatch(qaPreset, /\.agent-presets/);
});

test('published package shape exposes bundle patches and removes legacy preset sources', () => {
  assert.equal(packageManifest.exports?.['./cordis.patch.yml'], './cordis.patch.yml');
  assert.equal(packageManifest.exports?.['./preset/qa/cordis.patch.yml'], './preset/qa/cordis.patch.yml');
  assert.ok(packageManifest.files?.includes('preset'), 'published package must include preset bundles');
  for (const legacyPath of [
    'preset/qa/agent.cordis.yml',
    'preset/qa/preset.yml',
    'preset/quality-control/agent.cordis.yml',
    'preset/quality-control/preset.yml',
  ]) {
    assert.equal(fs.existsSync(path.join(root, legacyPath)), false, `legacy preset source remains: ${legacyPath}`);
  }
});

test('quality-control is an independent Harness 0.1.7 bundle', () => {
  assert.equal(qualityControlManifest.name, 'dsh-qa-quality-control');
  assert.deepEqual(qualityControlManifest.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.match(qualityControlPreset, /- id: preset-quality-control\n\s+name: '@deepseek-ai\/dsh-agent-preset'/);
  assert.match(qualityControlPreset, /config:\n\s+id: quality-control[\s\S]*?order: 6[\s\S]*?plugins:/);
  assert.match(qualityControlPreset, /- id: persona\n\s+name: '@deepseek-ai\/dsh-persona'\n\s+config:\n\s+prefix:/);
  assert.match(
    qualityControlPreset,
    /- id: plan-mode\n\s+name: '@deepseek-ai\/dsh-plan-mode'\n\s+config:\n\s+section:\s*\|\n\s+\S/,
    'quality-control plan mode must provide a non-empty section config',
  );
  assert.doesNotMatch(qualityControlPreset, /^\s+text:/m, 'quality-control still uses the retired text config key');
  assert.doesNotMatch(qualityControlPreset, /dsh-workflow-worker-thread/);
  assert.match(qualityControlPreset, /- id: workflow-ptc\n\s+name: '@deepseek-ai\/dsh-workflow-ptc'/);
});

test('preset installers use profile bundles instead of the retired directory model', () => {
  for (const [name, installer] of [
    ['qa', qaInstaller],
    ['quality-control', qualityControlInstaller],
  ]) {
    assert.match(installer, /--profile/ , `${name} installer must expose a profile option`);
    assert.match(installer, /plugin --profile/, `${name} installer must use dsh plugin profile management`);
    assert.match(installer, /link:/, `${name} installer must install the local bundle by link`);
    assert.doesNotMatch(installer, /\.agent-presets/, `${name} installer still targets the retired preset directory`);
    assert.doesNotMatch(installer, /\bcp\s+/, `${name} installer still copies preset files directly`);
  }
});

test('preset installers reject missing option values before invoking DSH', () => {
  for (const script of [
    'scripts/install-qa-preset.sh',
    'scripts/install-quality-control-preset.sh',
  ]) {
    for (const option of ['--profile', '--dsh']) {
      const result = spawnSync('bash', [path.join(root, script), option, '--dry-run'], {
        cwd: root,
        env: { ...process.env, DSH_BIN: 'true' },
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, `${script} accepted ${option} without a value`);
    }
  }
});

test('host smoke pins the exact Harness 0.1.7 release targeted by the bundle migration', () => {
  assert.match(hostConfig, /dsh-v0\.1\.7-alpha\.1/);
  assert.match(hostConfig, /dsh-v0\.1\.7-rc\.1/);
  assert.match(hostConfig, /supportedHostVersions/);
  assert.doesNotMatch(hostConfig, /dsh-v0\.1\.6-alpha\.1/);
});

test('DSH follow opens the Harness Remote stream WebSocket', () => {
  assert.match(app, /new WebSocket\(`\$\{scheme\}\/\/\$\{location\.host\}\/api\/remote\.mux`\)/);
  assert.equal(app.includes('`${scheme}//${location.host}/api`'), false, 'follow still uses the retired WebSocket path');
});

test('DSH skill catalog uses the Harness session request envelope', () => {
  assert.match(app, /dshRpc\('skills\/list', \{ request: \{ sessionId \} \}\)/);
  assert.equal(app.includes("dshRpc('skills/list', { agentId: sessionId })"), false, 'skills/list still uses the retired agentId envelope');
});

test('DSH command execution uses the Harness submittedAttachments field', () => {
  assert.match(app, /createCommandExecuteArgs\(sessionId, text\)/);
  assert.doesNotMatch(app, /commands\/execute'.*attachments\s*:/s, 'commands/execute still uses the retired attachments field');
});
