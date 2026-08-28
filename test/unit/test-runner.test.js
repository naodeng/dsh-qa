import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject, makeTestCase } from '../helpers/quality-fixtures.js';

const runnerDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-data-'));
process.env.QA_DATA_DIR = runnerDataDir;
const { createExecutionProfile, createExecutionProfileVersion, disableExecutionProfile } = await import('../../server/quality/execution-profile.js');
const { cancelRun, createRunPreview, startRun, recoverInterruptedRuns } = await import('../../server/quality/test-runner.js');
const store = await import('../../server/store.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('等待条件超时');
    await wait(10);
  }
}

test.after(() => {
  delete process.env.DSH_QA_TEST_SECRET;
  store.flush();
  fs.rmSync(runnerDataDir, { recursive: true, force: true });
});

test('runs controlled node tests and recovers interrupted runs', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const passCase = makeTestCase({ target: 'test/fixtures/runner/pass.fixture.mjs' });
  const failCase = makeTestCase({ target: 'test/fixtures/runner/fail.fixture.mjs' });
  project.testcases.push(passCase, failCase);
  const passProfile = createExecutionProfile(project, { name: 'pass', executor: 'node-test', cwdRelative: '.', targetFiles: [passCase.target], networkIntent: 'none' });
  const failProfile = createExecutionProfile(project, { name: 'fail', executor: 'node-test', cwdRelative: '.', targetFiles: [failCase.target], networkIntent: 'none' });
  const passPlan = { id: 'plan_pass', version: 1, testcaseIds: [passCase.id], status: 'reviewed' };
  const failPlan = { id: 'plan_fail', version: 1, testcaseIds: [failCase.id], status: 'reviewed' };
  project.testPlans.push(passPlan, failPlan);
  const passPreview = createRunPreview(project, passPlan.id, passProfile.id);
  assert.deepEqual(passPreview.effects, { declaredWrites: ['artifact-root'], networkIntent: 'none', filesystemEnforced: false, networkEnforced: false });
  const passed = await startRun(project, passPreview.previewToken);
  const failPreview = createRunPreview(project, failPlan.id, failProfile.id);
  assert.equal(failPreview.command.at(-1), failCase.target);
  const failed = await startRun(project, failPreview.previewToken);
  assert.equal(failed.command.at(-1), failCase.target);
  assert.equal(passed.status, 'passed');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.status, 'failed');
  assert.equal(fs.existsSync(path.join(passed.artifactDir, 'process.log')), true);
  assert.equal(path.basename(path.dirname(passed.artifactDir)), project.id);
  await assert.rejects(() => startRun(project, passPreview.previewToken), /预览已失效/);
  const interrupted = makeProject({ testruns: [{ id: 'run_1', status: 'running' }] });
  assert.equal(recoverInterruptedRuns([interrupted])[0].testruns[0].status, 'environment-error');
});

test('creates previews only for the current reviewed plan', () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const profile = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' });
  project.testPlans.push(
    { id: 'plan_draft', version: 1, testcaseIds: [], status: 'draft' },
    { id: 'plan_superseded', version: 1, testcaseIds: [], status: 'superseded' },
  );

  assert.throws(() => createRunPreview(project, 'plan_draft', profile.id), /reviewed|评审/);
  assert.throws(() => createRunPreview(project, 'plan_superseded', profile.id), /reviewed|评审/);
});

test('invalidates preview authorization after profile version changes or disablement', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const plan = { id: 'plan_current', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' });
  const staleVersionPreview = createRunPreview(project, plan.id, profile.id);
  createExecutionProfileVersion(project, profile.id, { timeoutMs: 60_000 });

  await assert.rejects(() => startRun(project, staleVersionPreview.previewToken), /预览.*失效|授权.*变化/);

  const disabledPreview = createRunPreview(project, plan.id, profile.id);
  disableExecutionProfile(project, profile.id);
  await assert.rejects(() => startRun(project, disabledPreview.previewToken), /预览.*失效|授权.*变化/);
});

test('records immutable preview inputs and rejects plan or source changes', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  project.qualityTasks.push({ id: 'task_preview', sources: [{ digest: 'a'.repeat(64) }] });
  const plan = { id: 'plan_preview', qualityTaskId: 'task_preview', version: 3, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' });
  const planChanged = createRunPreview(project, plan.id, profile.id);

  assert.equal(planChanged.planVersion, 3);
  assert.equal(planChanged.profileVersion, 1);
  assert.equal(planChanged.cwd, process.cwd());
  assert.deepEqual(planChanged.argv, [process.execPath, '--test', 'test/fixtures/runner/pass.fixture.mjs']);
  assert.match(planChanged.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(planChanged.authorizationDigest, /^[a-f0-9]{64}$/);

  plan.version = 4;
  await assert.rejects(() => startRun(project, planChanged.previewToken), /授权.*变化/);

  plan.version = 3;
  const sourceChanged = createRunPreview(project, plan.id, profile.id);
  project.qualityTasks[0].sources[0].digest = 'b'.repeat(64);
  await assert.rejects(() => startRun(project, sourceChanged.previewToken), /授权.*变化/);
});

test('does not let callers mutate the stored preview authorization', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const plan = { id: 'plan_immutable', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'immutable', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none' });
  const preview = createRunPreview(project, plan.id, profile.id);
  preview.argv.splice(2, 1, 'test/fixtures/runner/fail.fixture.mjs');

  const run = await startRun(project, preview.previewToken);

  assert.equal(run.status, 'passed');
  assert.equal(run.command.at(-1), 'test/fixtures/runner/pass.fixture.mjs');
});

test('cancels queued runs and rejects cancellation after completion', () => {
  const project = makeProject({ testruns: [{ id: 'queued_1', revision: 1, status: 'queued' }, { id: 'passed_1', revision: 2, status: 'passed' }] });
  const cancelled = cancelRun(project, 'queued_1', 1);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.revision, 2);
  assert.throws(() => cancelRun(project, 'passed_1', 2), /无法取消/);
});

test('queued cancellation prevents deferred execution from starting', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-queued-'));
  const marker = path.join(workspacePath, 'started.txt');
  fs.writeFileSync(path.join(workspacePath, 'queued.test.mjs'), `import fs from 'node:fs'; import test from 'node:test'; fs.writeFileSync(${JSON.stringify(marker)}, 'started'); test('queued', () => {});`);
  const project = makeProject({ workspacePath });
  const plan = { id: 'plan_queued', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'queued', executor: 'node-test', cwdRelative: '.', targetFiles: ['queued.test.mjs'], networkIntent: 'none' });
  const run = await startRun(project, createRunPreview(project, plan.id, profile.id).previewToken, { defer: true });

  cancelRun(project, run.id, run.revision);
  await wait(250);

  assert.equal(run.status, 'cancelled');
  assert.equal(fs.existsSync(marker), false);
});

test('running cancellation preserves cancelled and terminates the process group', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-cancel-'));
  const orphanMarker = path.join(workspacePath, 'orphan.txt');
  fs.writeFileSync(path.join(workspacePath, 'cancel.test.mjs'), `
    import { spawn } from 'node:child_process';
    import test from 'node:test';
    spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(orphanMarker)}, 'orphan'), 500)`) }]);
    test('wait', async () => { await new Promise((resolve) => setTimeout(resolve, 2_000)); });
  `);
  const project = makeProject({ workspacePath });
  const plan = { id: 'plan_cancel', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'cancel', executor: 'node-test', cwdRelative: '.', targetFiles: ['cancel.test.mjs'], networkIntent: 'none', timeoutMs: 10_000 });
  const run = await startRun(project, createRunPreview(project, plan.id, profile.id).previewToken, { defer: true });
  await waitFor(() => run.status === 'running');

  cancelRun(project, run.id, run.revision);
  await wait(750);

  assert.equal(run.status, 'cancelled');
  assert.equal(fs.existsSync(orphanMarker), false);
});

test('timeout remains timed-out after the child closes', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-timeout-'));
  fs.writeFileSync(path.join(workspacePath, 'timeout.test.mjs'), `import test from 'node:test'; test('wait', async () => { await new Promise((resolve) => setTimeout(resolve, 2_000)); });`);
  const project = makeProject({ workspacePath });
  const plan = { id: 'plan_timeout', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'timeout', executor: 'node-test', cwdRelative: '.', targetFiles: ['timeout.test.mjs'], networkIntent: 'none', timeoutMs: 1_000 });

  const run = await startRun(project, createRunPreview(project, plan.id, profile.id).previewToken);

  assert.equal(run.status, 'timed-out');
});

test('child process receives only the minimal allowed environment', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-env-'));
  fs.writeFileSync(path.join(workspacePath, 'env.test.mjs'), `import test from 'node:test'; import assert from 'node:assert/strict'; test('secret is absent', () => assert.equal(process.env.DSH_QA_TEST_SECRET, undefined));`);
  const project = makeProject({ workspacePath });
  const plan = { id: 'plan_env', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'env', executor: 'node-test', cwdRelative: '.', targetFiles: ['env.test.mjs'], networkIntent: 'none' });
  process.env.DSH_QA_TEST_SECRET = 'must-not-leak';

  const run = await startRun(project, createRunPreview(project, plan.id, profile.id).previewToken);

  assert.equal(run.status, 'passed');
});

test('persists terminal status after the process log is written', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-persist-'));
  fs.writeFileSync(path.join(workspacePath, 'slow.test.mjs'), `import test from 'node:test'; test('slow', async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });`);
  const project = store.createProject({ title: '持久化运行' });
  project.workspacePath = workspacePath;
  const plan = { id: 'plan_persist', version: 1, testcaseIds: [], status: 'reviewed' };
  project.testPlans.push(plan);
  const profile = createExecutionProfile(project, { name: 'persist', executor: 'node-test', cwdRelative: '.', targetFiles: ['slow.test.mjs'], networkIntent: 'none' });

  const run = await startRun(project, createRunPreview(project, plan.id, profile.id).previewToken);
  await wait(150);
  const disk = JSON.parse(fs.readFileSync(path.join(runnerDataDir, 'data.json'), 'utf8'));
  const saved = disk.projects.find((item) => item.id === project.id).testruns.find((item) => item.id === run.id);

  assert.equal(fs.existsSync(path.join(run.artifactDir, 'process.log')), true);
  assert.equal(saved.status, 'passed');
});
