import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshQaPanelDefinition } from '../../lib/panel-contract.js';

test('uses one id to connect sidebar.panellist and main keyed slot', () => {
  const definition = createDshQaPanelDefinition({
    id: 'dsh-qa',
    label: '质量工作台',
    icon: 'qa-icon',
    workbenchUrl: '/api/dsh-qa/workbench/',
  });

  assert.equal(definition.sidebarSlot.name, 'sidebar.panellist');
  assert.equal(definition.sidebarSlot.id, 'dsh-qa');
  assert.equal(definition.sidebarSlot.label, '质量工作台');
  assert.equal(definition.sidebarSlot.icon, 'qa-icon');
  assert.equal(definition.mainSlot.name, 'main');
  assert.equal(definition.mainSlot.key, 'dsh-qa');
  assert.equal(definition.mainSlot.workbenchUrl, '/api/dsh-qa/workbench/');
});

test('rejects incomplete semantic identities', () => {
  assert.throws(() => createDshQaPanelDefinition({ id: '' }), /Panel id/);
  assert.throws(() => createDshQaPanelDefinition({ label: '' }), /Panel label/);
  assert.throws(() => createDshQaPanelDefinition({ workbenchUrl: '' }), /Workbench URL/);
});
