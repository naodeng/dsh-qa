import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientSource = fs.readFileSync(path.join(root, '..', 'lib', 'client.js'), 'utf8');
const panelContractSource = fs.readFileSync(path.join(root, '..', 'lib', 'panel-contract.js'), 'utf8');
const lifecycleSource = fs.readFileSync(path.join(root, '..', 'test', 'e2e', 'dsh-panel-lifecycle.spec.js'), 'utf8');

test('mounts the Workbench through the official Harness Panel contract', () => {
  assert.match(clientSource, /registerDshQaPanel/);
  assert.match(clientSource, /sidebar\.panellist/);
  assert.match(clientSource, /name: ['"]main['"]/);
  assert.match(clientSource, /\/api\/dsh-qa\/workbench\//);
  assert.match(clientSource, /inject\s*[:=]\s*\[['"]slots['"],\s*['"]layout['"]\]/);

  for (const forbidden of [
    'MutationObserver',
    '[data-pane="conversation"]',
    'sidebarCol',
    'centerCol',
    'logoRow',
    'newSession',
    'data-dsh-qa-active',
    'dsh-panel-activate',
  ]) {
    assert.equal(clientSource.includes(forbidden), false, `legacy DOM integration remains: ${forbidden}`);
  }
});

test('keeps the runtime adapter as the only Panel renderer and makes host gaps explicit', () => {
  assert.doesNotMatch(panelContractSource, /registerDshQaPanel|createWorkbenchPanel|['"]iframe['"]/);
  assert.match(lifecycleSource, /test\.skip/);
  assert.doesNotMatch(lifecycleSource, /host-limitation|close-to-Conversation/);
});
