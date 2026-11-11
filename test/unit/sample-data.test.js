import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-sample-data-'));
process.env.QA_DATA_DIR = dataDir;
const { startQaBench, closeQaBench } = await import('../../server/index.js');
const store = await import('../../server/store.js');
const started = await startQaBench({ port: 0, openBrowser: false, log: () => {} });
const base = `http://127.0.0.1:${started.server.address().port}`;

test.after(async () => {
  await closeQaBench(started.server);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('示例数据清理会保护用户项目，并在纯示例数据时删除项目和迭代', async () => {
  const sampleIds = store.listProjects().map((project) => project.id);
  const sampleWorkspacePaths = store.listProjects().map((project) => store.ensureProjectWorkspace(project));
  assert.ok(sampleWorkspacePaths.every((workspacePath) => fs.existsSync(workspacePath)));
  for (const project of store.listProjects()) delete project.isSample;
  store.addFeed({ type: 'case', projectId: sampleIds[0], projectTitle: '示例项目', label: '示例活动' });

  const initialBoard = await (await fetch(`${base}/api/board`)).json();
  assert.equal(initialBoard.projects.length, 2);
  assert.ok(initialBoard.projects.every((project) => project.isSample));

  const created = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '用户自己的项目', projectKey: 'PRJ-2026-001', createWorkspace: false }),
  });
  assert.equal(created.status, 200);

  const blocked = await fetch(`${base}/api/sample-data`, { method: 'DELETE' });
  assert.equal(blocked.status, 409);
  assert.equal((await (await fetch(`${base}/api/board`)).json()).projects.length, 3);
  assert.ok(sampleWorkspacePaths.every((workspacePath) => fs.existsSync(workspacePath)));

  const userProject = (await created.json()).project;
  await fetch(`${base}/api/projects/${userProject.id}`, { method: 'DELETE' });

  const sampleParentId = store.listProjects().find((project) => project.kind !== 'iteration').id;
  const createdIteration = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '用户自己的迭代', kind: 'iteration', parentId: sampleParentId, createWorkspace: false }),
  });
  assert.equal(createdIteration.status, 200);
  const blockedByIteration = await fetch(`${base}/api/sample-data`, { method: 'DELETE' });
  assert.equal(blockedByIteration.status, 409);
  await fetch(`${base}/api/projects/${(await createdIteration.json()).project.id}`, { method: 'DELETE' });

  const cleared = await fetch(`${base}/api/sample-data`, { method: 'DELETE' });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).deleted, 2);
  const emptyBoard = await (await fetch(`${base}/api/board`)).json();
  assert.deepEqual(emptyBoard.projects, []);
  assert.ok(emptyBoard.feed.every((entry) => !sampleIds.includes(entry.projectId)));
  assert.ok(sampleWorkspacePaths.every((workspacePath) => !fs.existsSync(workspacePath)));
});
