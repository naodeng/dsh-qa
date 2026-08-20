import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-store-'));
process.env.QA_DATA_DIR = dataDir;
const store = await import('../../server/store.js');

test.after(() => { store.flush(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('project lifecycle records defaults, history, and feed materials', () => {
  store.loadStore();
  const project = store.createProject({ title: '支付回归', projectKey: 'PAY-1' });
  assert.equal(project.status, 'intake');
  assert.equal(store.transitionProject(project, 'design', 'human'), true);
  store.addFeed({ type: 'case', projectId: project.id, projectTitle: project.title, label: '新增用例' });
  assert.equal(project.status, 'design');
  assert.equal(project.history.at(-1).to, 'design');
  assert.equal(project.materials[0].label, '新增用例');
});

test('workspace creation stays under data directory and creates standard folders', () => {
  const project = store.createProject({ title: '支付/回归' });
  const workspace = store.ensureProjectWorkspace(project);
  assert.equal(path.dirname(path.dirname(workspace)), dataDir);
  for (const name of ['01_需求与范围', '02_测试计划', '03_测试用例', '04_测试数据与脚本', '05_测试执行', '06_缺陷', '07_测试报告', '08_发布与归档']) assert.equal(fs.existsSync(path.join(workspace, name)), true);
});
