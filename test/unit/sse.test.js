import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { broadcast, sseHandler } from '../../server/sse.js';

function openClient(write = (value) => value) {
  const req = new EventEmitter();
  const output = [];
  const res = {
    headers: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(value) { output.push(value); return write(value); },
  };
  sseHandler(req, res);
  return { req, res, output };
}

test('SSE 客户端收到 hello 和业务事件，断开后停止接收', () => {
  const client = openClient();
  assert.equal(client.res.status, 200);
  assert.equal(client.res.headers['Content-Type'], 'text/event-stream');
  assert.ok(client.output.some((value) => value.includes('event: hello')));

  broadcast('project.created', { projectId: 'project_1' });
  assert.ok(client.output.some((value) => value.includes('event: project.created')));
  const countAfterDelivery = client.output.length;

  client.req.emit('close');
  broadcast('project.deleted', { projectId: 'project_1' });
  assert.equal(client.output.length, countAfterDelivery);
});

test('SSE 写入失败后移除断开的客户端', () => {
  let failWrites = false;
  const client = openClient(() => { if (failWrites) throw new Error('socket closed'); });
  failWrites = true;
  broadcast('project.updated', { projectId: 'project_2' });
  failWrites = false;
  const countAfterFailure = client.output.length;

  broadcast('project.updated', { projectId: 'project_3' });
  assert.equal(client.output.length, countAfterFailure);
  client.req.emit('close');
});
