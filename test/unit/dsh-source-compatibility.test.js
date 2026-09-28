import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, normalizeLegacyPluginSources } from '../../lib/index.js';

test('normalizes legacy plugin source wrappers while preserving message attribution', () => {
  const legacy = {
    id: 'hindsight-context',
    role: 'user',
    content: [{ type: 'text', text: 'memory context' }],
    source: { kind: 'plugin', plugin: 'hindsight', form: 'recall' },
  };
  const decision = { kind: 'enter', messages: [legacy] };

  const normalized = normalizeLegacyPluginSources(decision);

  assert.notEqual(normalized, decision);
  assert.notEqual(normalized.messages, decision.messages);
  assert.deepEqual(normalized.messages[0], {
    ...legacy,
    source: { kind: 'plugin:hindsight', plugin: 'hindsight', form: 'recall' },
  });
  assert.deepEqual(legacy.source, { kind: 'plugin', plugin: 'hindsight', form: 'recall' });
});

test('leaves native and non-owned sources unchanged', () => {
  const messages = [
    { id: 'native-plugin', source: { kind: 'plugin:hindsight', plugin: 'hindsight' } },
    { id: 'user', source: { kind: 'user', rpcId: 'rpc-1' } },
    { id: 'missing-owner', source: { kind: 'plugin', form: 'notice' } },
    { id: 'blank-owner', source: { kind: 'plugin', plugin: '   ' } },
  ];
  const decision = { kind: 'enter', messages };

  const normalized = normalizeLegacyPluginSources(decision);

  assert.equal(normalized, decision);
  assert.equal(normalized.messages, messages);
});

test('does not normalize rejected decisions or malformed message entries', () => {
  const reject = { kind: 'reject', messages: [{ source: { kind: 'plugin', plugin: 'hindsight' } }] };
  const malformed = {
    kind: 'enter',
    messages: [null, 'text', { source: null }, { source: ['plugin', 'hindsight'] }],
  };

  assert.equal(normalizeLegacyPluginSources(reject), reject);
  assert.equal(normalizeLegacyPluginSources(malformed), malformed);
});

test('registers the source normalizer as an outer pre-step hook', async () => {
  const hooks = [];
  apply({
    on(name, listener, options) {
      hooks.push({ name, listener, options });
      return () => {};
    },
    effect() {},
  });

  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].name, 'agent/pre-step');
  assert.equal(hooks[0].options.prepend, true);

  const decision = await hooks[0].listener({}, async () => ({
    kind: 'enter',
    messages: [{ source: { kind: 'plugin', plugin: 'hindsight' } }],
  }));
  assert.equal(decision.messages[0].source.kind, 'plugin:hindsight');
});
