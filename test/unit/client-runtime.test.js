import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createDshQaPanelDefinition } from '../../lib/panel-contract.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientSource = fs.readFileSync(path.join(root, '..', 'lib', 'client.js'), 'utf8');

function loadClientRuntime() {
  let moduleDefinition;
  const listeners = new Map();
  const listenerEvents = [];
  const effectCleanups = [];
  const window = {
    __ModuleLoader__: {
      load(definition) {
        moduleDefinition = definition;
      },
    },
    location: { origin: 'http://harness.test' },
    addEventListener(type, listener) {
      listenerEvents.push({ action: 'add', type, listener });
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      listenerEvents.push({ action: 'remove', type, listener });
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const React = {
    createElement(type, props, ...children) {
      return { type, props, children };
    },
    useRef(current) {
      return { current };
    },
    useEffect(effect) {
      effectCleanups.push(effect());
    },
  };

  vm.runInNewContext(clientSource, { window, React }, { filename: 'lib/client.js' });
  assert.ok(moduleDefinition, 'client bundle did not register a ModuleLoader definition');
  const runtime = moduleDefinition.factory((name) => {
    assert.equal(name, 'react');
    return React;
  });
  return { runtime, window, listenerEvents, effectCleanups };
}

function createContext() {
  const registrations = [];
  const disposed = [];
  const effects = [];
  const ctx = {
    slots: {
      inject(name, callback) {
        const disposeRegistration = callback();
        registrations.push({ name, disposeRegistration });
        return () => {
          disposed.push(`inject:${name}`);
          disposeRegistration?.();
        };
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => disposed.push(`registration:${options.name}`);
      },
    },
    effect(effect) {
      effects.push(effect());
    },
    layout: { selectPanel() {} },
  };
  return { ctx, registrations, disposed, effects };
}

test('raw client bundle exposes the same semantic Panel identity', () => {
  const { runtime } = loadClientRuntime();
  const options = { id: 'dsh-qa', label: '质量工作台', icon: 'qa-icon', workbenchUrl: '/api/dsh-qa/workbench/' };

  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.createDshQaPanelDefinition(options))),
    createDshQaPanelDefinition(options),
  );
});

test('raw client bundle registers and disposes both official slots once', () => {
  const { runtime } = loadClientRuntime();
  const { ctx, registrations, disposed } = createContext();
  const dispose = runtime.registerDshQaPanel(ctx, runtime.createDshQaPanelDefinition({ icon: 'qa-icon' }));

  assert.deepEqual(registrations.filter((entry) => entry.name).map((entry) => entry.name), [
    'sidebar.panellist',
    'main',
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(registrations.filter((entry) => entry.options).map((entry) => entry.options))),
    [
      { name: 'sidebar.panellist', id: 'dsh-qa', label: '质量工作台' },
      { name: 'main', key: 'dsh-qa' },
    ],
  );

  dispose();
  dispose();

  assert.deepEqual(disposed, [
    'inject:main',
    'registration:main',
    'inject:sidebar.panellist',
    'registration:sidebar.panellist',
  ]);
});

test('raw client apply wires the host effect to the registration disposer', () => {
  const { runtime } = loadClientRuntime();
  const { ctx, disposed, effects } = createContext();

  runtime.apply(ctx);
  assert.equal(effects.length, 1);

  effects[0]();
  assert.deepEqual(disposed, [
    'inject:main',
    'registration:main',
    'inject:sidebar.panellist',
    'registration:sidebar.panellist',
  ]);
});

test('raw client main renderer removes its message listener on unmount', () => {
  const { runtime, listenerEvents, effectCleanups } = loadClientRuntime();
  const { ctx, registrations } = createContext();

  runtime.registerDshQaPanel(ctx, runtime.createDshQaPanelDefinition({ icon: 'qa-icon' }));
  const mainRegistration = registrations.find((entry) => entry.options?.name === 'main');
  mainRegistration.component();

  assert.equal(effectCleanups.length, 1);
  assert.deepEqual(listenerEvents.map(({ action, type }) => ({ action, type })), [
    { action: 'add', type: 'message' },
  ]);

  effectCleanups[0]();
  assert.deepEqual(listenerEvents.map(({ action, type }) => ({ action, type })), [
    { action: 'add', type: 'message' },
    { action: 'remove', type: 'message' },
  ]);
});
