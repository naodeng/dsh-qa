import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-api-'));
process.env.QA_DATA_DIR = dataDir;
const { startQaBench, closeQaBench } = await import('../../server/index.js');
const started = await startQaBench({ port: 0, openBrowser: false, log: () => {} });
const base = `http://127.0.0.1:${started.server.address().port}`;

test.after(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); await closeQaBench(started.server); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('project API creates projects and rejects invalid input', async () => {
  const empty = await fetch(`${base}/api/projects`);
  assert.equal(empty.status, 200);
  const invalid = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /标题不能为空/);
  const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'API 项目', createWorkspace: false }) });
  assert.equal(created.status, 200);
  assert.equal((await created.json()).project.title, 'API 项目');
});

test('board API exposes created project and rejects invalid transition', async () => {
  const board = await (await fetch(`${base}/api/board`)).json();
  assert.equal(board.projects.some((project) => project.title === 'API 项目'), true);
  const id = board.projects.find((project) => project.title === 'API 项目').id;
  const invalid = await fetch(`${base}/api/projects/${id}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'unknown' }) });
  assert.equal(invalid.status, 400);
});
