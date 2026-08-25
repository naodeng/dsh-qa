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

test('project API transitions stages and manages scheduled items', async () => {
  const created = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '排期 API 项目', createWorkspace: false }),
  })).json();
  const id = created.project.id;

  const transitioned = await fetch(`${base}/api/projects/${id}/transition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: 'design' }),
  });
  assert.equal(transitioned.status, 200);
  assert.equal((await transitioned.json()).project.status, 'design');

  const scheduled = await fetch(`${base}/api/projects/${id}/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '用例评审会', date: '2030-04-15', type: 'event' }),
  });
  assert.equal(scheduled.status, 200);
  const item = (await scheduled.json()).item;
  assert.equal(item.title, '用例评审会');

  const removed = await fetch(`${base}/api/projects/${id}/schedule/${item.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).removedId, item.id);
});

test('project API validates schedule payloads and missing resources', async () => {
  const created = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '排期校验项目', createWorkspace: false }),
  })).json();
  const id = created.project.id;

  const invalidDate = await fetch(`${base}/api/projects/${id}/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '缺少日期', date: '2030/04/15' }),
  });
  assert.equal(invalidDate.status, 400);
  assert.match((await invalidDate.json()).error, /日期格式无效/);

  const missing = await fetch(`${base}/api/projects/${id}/schedule/evt-missing`, { method: 'DELETE' });
  assert.equal(missing.status, 404);
});

test('skills API returns language-specific catalog in website category order', async () => {
  const response = await fetch(`${base}/api/skills?lang=zh`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.lang, 'zh');
  assert.ok(payload.skills.length > 0);
  assert.deepEqual(payload.categories.slice(0, 3).map((category) => category.id), ['testing-types', 'testing-workflows', 'enhanced']);
  assert.deepEqual(payload.groups.map((group) => group.zh), ['需求与策略', '用例与评审', '功能与兼容', '接口与自动化', '质量保障专项', '缺陷、报告与审查']);
  assert.equal(payload.skills[0].categoryId, 'testing-types');
  assert.equal(payload.skills.find((skill) => skill.name === 'requirements-analysis').name, 'requirements-analysis');
  assert.match(payload.skills.find((skill) => skill.name === 'requirements-analysis').description, /^输入需求文档/);
  assert.doesNotMatch(payload.skills.find((skill) => skill.name === 'requirements-analysis').description, /^Use this skill/);
  assert.match(payload.skills.find((skill) => skill.name === 'requirements-analysis').siteUrl, /inaodeng\.com\/zh-cn\/qaskills\/requirements-analysis/);
  assert.ok(payload.skills.find((skill) => skill.name === 'requirements-analysis').intro);
  assert.equal(payload.skills.findIndex((skill) => skill.name === 'requirements-analysis') < payload.skills.findIndex((skill) => skill.name === 'test-case-writing'), true);
  assert.ok(payload.skills.some((skill) => skill.name === 'api-test-bruno'));
  assert.deepEqual(payload.skills.filter((skill) => skill.categoryId === 'enhanced').map((skill) => skill.name), ['requirements-analysis-plus', 'test-case-reviewer-plus', 'test-strategy-plus', 'testcase-writer-plus']);
});

test('skills API localizes card descriptions by language', async () => {
  const response = await fetch(`${base}/api/skills?lang=en`);
  const payload = await response.json();
  const skill = payload.skills.find((item) => item.name === 'requirements-analysis');
  assert.match(skill.description, /^Provide requirements/);
  assert.match(skill.siteUrl, /inaodeng\.com\/en\/qaskills\/requirements-analysis/);
});

test('skills API rejects unsupported language', async () => {
  const response = await fetch(`${base}/api/skills?lang=fr`);
  assert.equal(response.status, 400);
});
