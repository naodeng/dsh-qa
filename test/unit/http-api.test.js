import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-api-'));
const skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-skills-'));
process.env.QA_DATA_DIR = dataDir;
process.env.DSH_SKILLS_DIR = skillsDir;
const { startQaBench, closeQaBench } = await import('../../server/index.js');
const store = await import('../../server/store.js');
const started = await startQaBench({ port: 0, openBrowser: false, log: () => {} });
const base = `http://127.0.0.1:${started.server.address().port}`;

test.after(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); await closeQaBench(started.server); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(skillsDir, { recursive: true, force: true }); });

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
  const detail = await (await fetch(`${base}/api/projects/${id}`)).json();
  assert.equal('artifactRoot' in detail.project, false);
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

test('quality task API creates, lists, and enforces revision conflicts', async () => {
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '质量任务 API 项目', createWorkspace: false }),
  })).json();
  const projectId = project.project.id;
  const created = await fetch(`${base}/api/projects/${projectId}/quality-tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '支付回调风险' }),
  });
  assert.equal(created.status, 201);
  const task = (await created.json()).task;
  assert.equal(task.title, '支付回调风险');
  const listed = await fetch(`${base}/api/projects/${projectId}/quality-tasks`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).tasks[0].id, task.id);
  const conflict = await fetch(`${base}/api/projects/${projectId}/quality-tasks/${task.id}/decisions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 0, action: 'confirm' }),
  });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /版本|revision/i);
});

test('manual analysis rejects host fields and records manual origin', async () => {
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '手工分析 API 项目', createWorkspace: false }),
  })).json();
  const projectId = project.project.id;
  const task = (await (await fetch(`${base}/api/projects/${projectId}/quality-tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '手工任务' }),
  })).json()).task;
  const forged = await fetch(`${base}/api/projects/${projectId}/quality-tasks/${task.id}/manual-analyses`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 1, origin: 'agent', dshSessionId: 'forged', risks: [] }),
  });
  assert.equal(forged.status, 400);
  const manual = await fetch(`${base}/api/projects/${projectId}/quality-tasks/${task.id}/manual-analyses`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 1, actorLabel: '张测试', acceptanceCriteria: [], risks: [], testScope: [] }),
  });
  assert.equal(manual.status, 201);
  const saved = (await manual.json()).task;
  assert.equal(saved.analysisOrigin, 'manual');
  assert.equal(saved.analysisRuns.at(-1).dshSessionId, '');
});

test('execution API creates profiles and returns a run preview', async () => {
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '执行 API 项目', createWorkspace: false }),
  })).json();
  const projectId = project.project.id;
  const profileResponse = await fetch(`${base}/api/projects/${projectId}/execution-profiles`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' }),
  });
  assert.equal(profileResponse.status, 201);
  const profile = (await profileResponse.json()).profile;
  const current = store.getProject(projectId);
  current.testcases.push({ id: 'tc_api_run', target: 'test/fixtures/runner/pass.fixture.mjs', planIds: [] });
  current.testPlans.push({ id: 'plan_api_run', version: 1, testcaseIds: ['tc_api_run'], status: 'reviewed' });
  const previewResponse = await fetch(`${base}/api/projects/${projectId}/test-plans/plan_api_run/run-preview`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: profile.id }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = (await previewResponse.json()).preview;
  const runResponse = await fetch(`${base}/api/projects/${projectId}/test-plans/plan_api_run/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewToken: preview.previewToken }),
  });
  assert.equal(runResponse.status, 202);
  assert.equal((await runResponse.json()).run.status, 'queued');
});

test('execution API versions and disables profiles with revision checks', async () => {
  const project = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '配置版本 API 项目', createWorkspace: false }) })).json();
  const projectId = project.project.id;
  const created = await (await fetch(`${base}/api/projects/${projectId}/execution-profiles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' }) })).json();
  const profile = created.profile;
  const version = await fetch(`${base}/api/projects/${projectId}/execution-profiles/${profile.id}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, timeoutMs: 60000 }) });
  assert.equal(version.status, 201);
  assert.equal((await version.json()).profile.version, 2);
  const stale = await fetch(`${base}/api/projects/${projectId}/execution-profiles/${profile.id}/disable`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1 }) });
  assert.equal(stale.status, 409);
});

test('plan API reviews versions and cancels a queued run', async () => {
  const project = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '计划 API 项目', createWorkspace: false }) })).json();
  const projectId = project.project.id;
  const current = store.getProject(projectId);
  current.qualityTasks.push({ id: 'qt_api_plan', projectId, risks: [] });
  current.testcases.push({ id: 'tc_plan_api', target: 'test/fixtures/runner/pass.fixture.mjs', planIds: [] });
  current.testPlans.push({ id: 'plan_api_review', qualityTaskId: 'qt_api_plan', version: 1, testcaseIds: ['tc_plan_api'], status: 'draft' });
  const reviewed = await fetch(`${base}/api/projects/${projectId}/test-plans/plan_api_review/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, actorLabel: '张测试' }) });
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).plan.status, 'reviewed');
  const next = await fetch(`${base}/api/projects/${projectId}/test-plans/plan_api_review/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, testcaseIds: ['tc_plan_api'] }) });
  assert.equal(next.status, 201);
  assert.equal((await next.json()).plan.version, 2);
});

test('quality APIs expose gate state and regression assets', async () => {
  const project = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '质量门禁 API 项目', createWorkspace: false }) })).json();
  const projectId = project.project.id;
  const current = store.getProject(projectId);
  current.testcases.push({ id: 'tc_gate_api', title: '门禁用例', planIds: [] });
  const created = await fetch(`${base}/api/projects/${projectId}/regression-sets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '主回归', testCaseIds: ['tc_gate_api'] }) });
  assert.equal(created.status, 201);
  const set = (await created.json()).regressionSet;
  const excluded = await fetch(`${base}/api/projects/${projectId}/regression-sets/${set.id}/exclude`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testCaseId: 'tc_gate_api', actor: 'tester', reason: '环境未就绪' }) });
  assert.equal(excluded.status, 200);
  const gate = await fetch(`${base}/api/projects/${projectId}/quality-gate`);
  assert.equal(gate.status, 200);
  assert.equal((await gate.json()).gate.status, 'passed');
});

test('failure analysis API requires confirmation before defect promotion', async () => {
  const project = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '故障分析 API 项目', createWorkspace: false }) })).json();
  const projectId = project.project.id;
  const current = store.getProject(projectId);
  current.testruns.push({ id: 'run_failure_api', projectId, status: 'failed', mode: 'local', resultTrust: 'controlled-local' });
  const analysisResponse = await fetch(`${base}/api/projects/${projectId}/test-runs/run_failure_api/failure-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: '提交失败', rootCause: '接口错误', category: 'product' }) });
  assert.equal(analysisResponse.status, 201);
  const analysis = (await analysisResponse.json()).analysis;
  const rejected = await fetch(`${base}/api/projects/${projectId}/failure-analyses/${analysis.id}/promote-defect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: false }) });
  assert.equal(rejected.status, 400);
  const promoted = await fetch(`${base}/api/projects/${projectId}/failure-analyses/${analysis.id}/promote-defect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true, actor: 'tester' }) });
  assert.equal(promoted.status, 201);
  assert.equal((await promoted.json()).defect.status, 'open');
});

test('evidence API finalizes, lists, downloads, and rejects tampered files', async () => {
  const project = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '证据 API 项目', createWorkspace: false }) })).json();
  const projectId = project.project.id;
  const current = store.getProject(projectId);
  const staging = path.join(dataDir, 'artifacts', projectId, 'run_evidence.staging');
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, 'process.log'), 'passed');
  current.testruns.push({ id: 'run_evidence', projectId, status: 'passed', mode: 'local', resultTrust: 'controlled-local', artifactDir: staging });
  const finalized = await fetch(`${base}/api/projects/${projectId}/test-runs/run_evidence/evidence/finalize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(finalized.status, 201);
  const evidence = (await finalized.json()).evidence;
  assert.equal('root' in evidence, false);
  const listed = await fetch(`${base}/api/projects/${projectId}/evidence`);
  assert.equal((await listed.json()).evidence[0].id, evidence.id);
  const downloaded = await fetch(`${base}/api/projects/${projectId}/evidence/${evidence.id}/download?path=process.log`);
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), 'passed');
  fs.appendFileSync(path.join(dataDir, 'artifacts', projectId, 'evidence', evidence.id, 'process.log'), 'changed');
  const tampered = await fetch(`${base}/api/projects/${projectId}/evidence/${evidence.id}/download?path=process.log`);
  assert.equal(tampered.status, 409);
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

test('skills API reports whether a Skill is installed in the DSH directory', async () => {
  const before = await (await fetch(`${base}/api/skills?lang=zh`)).json();
  assert.equal(before.skills.find((skill) => skill.name === 'requirements-analysis').installed, false);
  fs.mkdirSync(path.join(skillsDir, 'requirements-analysis'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'requirements-analysis', 'SKILL.md'), '# 需求分析（中文版）\n');
  const after = await (await fetch(`${base}/api/skills?lang=zh`)).json();
  assert.equal(after.skills.find((skill) => skill.name === 'requirements-analysis').installed, true);
});

test('skills API uninstalls a Skill from the DSH directory', async () => {
  const skillDir = path.join(skillsDir, 'test-case-writing');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test case writing\n');
  const response = await fetch(`${base}/api/skills/test-case-writing`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal(fs.existsSync(skillDir), false);
});
