import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createClientRequest,
  createFollowOpen,
  openFollowSnapshot,
  parseFollowSnapshot,
} from '../../public/dsh-rpc-contract.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/dsh-0.1.6-follow-snapshot.json', import.meta.url), 'utf8'));

class FakeSocket {
  listeners = new Map();
  sent = [];
  closeCalls = 0;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.closeCalls += 1;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

test('builds the current client-request envelope', () => {
  assert.deepEqual(createClientRequest('rpc_1', 'agentPresets/list', { scope: 'web' }), {
    type: 'client-request',
    rpcId: 'rpc_1',
    method: 'agentPresets/list',
    payload: { args: { scope: 'web' } },
  });
});

test('builds the session/follow WebSocket open envelope', () => {
  assert.deepEqual(createFollowOpen('stream_1', 'session_1', 100), {
    type: 'open',
    streamId: 'stream_1',
    endpoint: 'session/follow',
    payload: {
      args: {
        request: {
          address: { kind: 'session', sessionId: 'session_1' },
          maxMessages: 100,
        },
      },
    },
  });
});

test('parses snapshot records without deprecated history APIs', () => {
  assert.deepEqual(parseFollowSnapshot({ snapshot: { records: [{ id: 'event_1' }], cursor: 4 } }), {
    records: [{ id: 'event_1' }],
    cursor: 4,
  });
});

test('preserves follow records and ignores unrelated stream frames', async () => {
  const socket = new FakeSocket();
  const promise = openFollowSnapshot(socket, {
    streamId: 'stream_1',
    sessionId: 'session_1',
    maxMessages: 100,
    timeoutMs: 100,
  });
  socket.emit('open');
  assert.deepEqual(JSON.parse(socket.sent[0]), createFollowOpen('stream_1', 'session_1', 100));

  socket.emit('message', { data: 'not json' });
  socket.emit('message', { data: JSON.stringify({ streamId: 'other', type: 'item', value: fixture.snapshot }) });
  let settled = false;
  promise.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);

  socket.emit('message', { data: JSON.stringify({ streamId: 'stream_1', type: 'item', value: fixture.snapshot }) });
  assert.deepEqual(await promise, { records: fixture.snapshot.records, cursor: 7 });
  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.listenerCount('message'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
  socket.emit('message', { data: JSON.stringify({ streamId: 'stream_1', type: 'done' }) });
  await Promise.resolve();
  assert.equal(settled, true);
});

test('rejects follow errors and close-before-snapshot with bounded cleanup', async () => {
  const errorSocket = new FakeSocket();
  const errorPromise = openFollowSnapshot(errorSocket, { streamId: 'stream_error', sessionId: 'session_1', timeoutMs: 100 });
  errorSocket.emit('error');
  await assert.rejects(errorPromise, /WebSocket 连接失败/);
  assert.equal(errorSocket.closeCalls, 1);
  assert.equal(errorSocket.listenerCount('open'), 0);
  assert.equal(errorSocket.listenerCount('message'), 0);

  const closeSocket = new FakeSocket();
  const closePromise = openFollowSnapshot(closeSocket, { streamId: 'stream_close', sessionId: 'session_1', timeoutMs: 100 });
  closeSocket.emit('close');
  await assert.rejects(closePromise, /WebSocket 已关闭/);
  assert.equal(closeSocket.closeCalls, 1);
  assert.equal(closeSocket.listenerCount('close'), 0);
});

test('rejects a follow that times out before its snapshot', async () => {
  const socket = new FakeSocket();
  const promise = openFollowSnapshot(socket, { streamId: 'stream_timeout', sessionId: 'session_1', timeoutMs: 5 });
  await assert.rejects(promise, /快照超时/);
  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.listenerCount('message'), 0);
});
