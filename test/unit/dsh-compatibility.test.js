import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

test('DSH integration uses current slash RPC namespaces instead of retired API Proxy methods', () => {
  for (const retired of [
    'agentPreset.list', 'agentPreset.select', 'session.list', 'session.models',
    'session.create', 'session.rename', 'skill.list', 'session.history',
    'session.prompt', 'session.cancel', 'session.selectModel',
  ]) {
    assert.equal(app.includes(retired), false, `retired DSH RPC method remains: ${retired}`);
  }
  for (const current of [
    'agentPresets/list', 'session/list', 'session/modelCatalog', 'skills/list',
    'commands/list', 'session/follow', 'session/prompt',
  ]) {
    assert.equal(app.includes(current), true, `current DSH RPC endpoint is missing: ${current}`);
  }
});

test('DSH Remote UI and implementation are absent', () => {
  for (const removed of ['btn-remote', 'openRemotePanel', 'refreshRemoteStatus', 'remoteStatusView', 'remote: { status:']) {
    assert.equal(app.includes(removed), false, `removed Remote integration remains: ${removed}`);
  }
});
