import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshQaPanelDefinition, registerDshQaPanel } from '../../lib/panel-contract.js';

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

test('registers both official slots and disposes them together', () => {
  const definition = createDshQaPanelDefinition({ id: 'dsh-qa', label: '质量工作台', icon: 'qa-icon' });
  const registrations = [];
  const disposed = [];
  const ctx = {
    slots: {
      inject(name, callback) {
        const disposeRegistration = callback();
        registrations.push({ name, disposeRegistration });
        return () => {
          disposed.push(name);
          disposeRegistration?.();
        };
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => disposed.push(options.name);
      },
    },
    layout: { selectPanel() {} },
  };

  const dispose = registerDshQaPanel(ctx, definition);

  assert.deepEqual(registrations.filter((entry) => entry.name).map((entry) => entry.name), [
    'sidebar.panellist',
    'main',
  ]);
  assert.deepEqual(registrations.filter((entry) => entry.options).map((entry) => entry.options), [
    { name: 'sidebar.panellist', id: 'dsh-qa', label: '质量工作台' },
    { name: 'main', key: 'dsh-qa' },
  ]);

  dispose();

  assert.deepEqual(disposed, [
    'main',
    'main',
    'sidebar.panellist',
    'sidebar.panellist',
  ]);

  dispose();
  assert.equal(disposed.length, 4);
});
