import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const rpcContract = fs.readFileSync(path.join(root, 'public/dsh-rpc-contract.js'), 'utf8');
const qaPreset = fs.readFileSync(path.join(root, 'preset/qa/agent.cordis.yml'), 'utf8');
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

test('QA preset uses the Harness 0.1.6 workflow engine package', () => {
  assert.equal(
    qaPreset.includes('@deepseek-ai/dsh-workflow-worker-thread'),
    false,
    'QA preset still references the removed worker-thread workflow package',
  );
  assert.match(qaPreset, /- id: workflow-ptc\n\s+name: '@deepseek-ai\/dsh-workflow-ptc'/);
});

test('QA preset uses the Harness 0.1.6 persona config schema', () => {
  assert.match(qaPreset, /- id: persona\n\s+name: '@deepseek-ai\/dsh-persona'\n\s+config:\n\s+prefix:/);
  assert.doesNotMatch(qaPreset, /^(\s+)text:/m, 'QA persona still uses the retired text config key');
});

test('DSH follow opens the Harness Remote stream WebSocket', () => {
  assert.match(app, /new WebSocket\(`\$\{scheme\}\/\/\$\{location\.host\}\/api\/remote\.mux`\)/);
  assert.equal(app.includes('`${scheme}//${location.host}/api`'), false, 'follow still uses the retired WebSocket path');
});

test('DSH skill catalog uses the Harness session request envelope', () => {
  assert.match(app, /dshRpc\('skills\/list', \{ request: \{ sessionId \} \}\)/);
  assert.equal(app.includes("dshRpc('skills/list', { agentId: sessionId })"), false, 'skills/list still uses the retired agentId envelope');
});
