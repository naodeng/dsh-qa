import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const rpcContract = fs.readFileSync(path.join(root, 'public/dsh-rpc-contract.js'), 'utf8');
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
