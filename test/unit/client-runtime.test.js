import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createDshQaPanelDefinition } from '../../lib/panel-contract.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientSource = fs.readFileSync(path.join(root, '..', 'lib', 'client.js'), 'utf8');

function loadClientRuntime({ nullForNoopener = false } = {}) {
  let moduleDefinition;
  const listeners = new Map();
  const listenerEvents = [];
  const effectCleanups = [];
  const alerts = [];
  const openedPopups = [];
  const window = {
    __ModuleLoader__: {
      load(definition) {
        moduleDefinition = definition;
      },
    },
    location: { origin: 'http://harness.test' },
    alert(message) {
      alerts.push(message);
    },
    open(url, target, features) {
      const popup = {
        url,
        target,
        features,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      openedPopups.push(popup);
      return nullForNoopener && String(features || '').includes('noopener') ? null : popup;
    },
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
  return { runtime, window, alerts, listenerEvents, effectCleanups, openedPopups };
}

function findRenderedElement(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRenderedElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const match = findRenderedElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function createContext({ failOnInject } = {}) {
  const registrations = [];
  const disposed = [];
  const effects = [];
  const ctx = {
    slots: {
      inject(name, callback) {
        if (failOnInject === name) throw new Error(`${name} slot unavailable`);
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

test('raw client main renderer closes opened popouts on unmount', () => {
  const { runtime, effectCleanups, openedPopups } = loadClientRuntime();
  const { ctx, registrations } = createContext();

  runtime.registerDshQaPanel(ctx, runtime.createDshQaPanelDefinition({ icon: 'qa-icon' }));
  const mainRegistration = registrations.find((entry) => entry.options?.name === 'main');
  const tree = mainRegistration.component();
  const popout = findRenderedElement(tree, (node) => node.props?.['aria-label'] === '在标签页打开');

  assert.ok(popout, 'main renderer did not expose the popout button');
  popout.props.onClick();
  assert.equal(openedPopups.length, 1);
  assert.equal(openedPopups[0].closed, false);

  effectCleanups[0]();
  assert.equal(openedPopups[0].closed, true);
});

test('raw client keeps managed popouts closeable when noopener would hide the handle', () => {
  const { runtime, effectCleanups, openedPopups } = loadClientRuntime({ nullForNoopener: true });
  const { ctx, registrations } = createContext();

  runtime.registerDshQaPanel(ctx, runtime.createDshQaPanelDefinition({ icon: 'qa-icon' }));
  const mainRegistration = registrations.find((entry) => entry.options?.name === 'main');
  const tree = mainRegistration.component();
  const popout = findRenderedElement(tree, (node) => node.props?.['aria-label'] === '在标签页打开');

  popout.props.onClick();
  assert.equal(openedPopups.length, 1);
  effectCleanups[0]();
  assert.equal(openedPopups[0].closed, true);
});

test('raw client reports a Panel registration failure without leaving a registration', () => {
  const { runtime, alerts } = loadClientRuntime();
  const { ctx, registrations, disposed, effects } = createContext({ failOnInject: 'main' });

  runtime.apply(ctx);

  assert.equal(effects.length, 0);
  assert.equal(registrations.filter((entry) => entry.options).length, 1);
  assert.deepEqual(disposed, [
    'inject:sidebar.panellist',
    'registration:sidebar.panellist',
  ]);
  assert.match(alerts[0], /Harness Panel/);
});

test('raw client and semantic contract keep the default Panel identity aligned', () => {
  const { runtime } = loadClientRuntime();
  const raw = runtime.createDshQaPanelDefinition();
  const semantic = createDshQaPanelDefinition();

  assert.deepEqual(
    {
      sidebarName: raw.sidebarSlot.name,
      sidebarId: raw.sidebarSlot.id,
      sidebarLabel: raw.sidebarSlot.label,
      mainName: raw.mainSlot.name,
      mainKey: raw.mainSlot.key,
      workbenchUrl: raw.mainSlot.workbenchUrl,
    },
    {
      sidebarName: semantic.sidebarSlot.name,
      sidebarId: semantic.sidebarSlot.id,
      sidebarLabel: semantic.sidebarSlot.label,
      mainName: semantic.mainSlot.name,
      mainKey: semantic.mainSlot.key,
      workbenchUrl: semantic.mainSlot.workbenchUrl,
    },
  );
});
