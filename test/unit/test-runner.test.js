import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeProject, makeTestCase } from '../helpers/quality-fixtures.js';
import { createExecutionProfile } from '../../server/quality/execution-profile.js';
import { cancelRun, createRunPreview, startRun, recoverInterruptedRuns } from '../../server/quality/test-runner.js';

test('runs controlled node tests and recovers interrupted runs', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const passCase = makeTestCase({ target: 'test/fixtures/runner/pass.fixture.mjs' });
  const failCase = makeTestCase({ target: 'test/fixtures/runner/fail.fixture.mjs' });
  project.testcases.push(passCase, failCase);
  const passProfile = createExecutionProfile(project, { name: 'pass', executor: 'node-test', cwdRelative: '.', targetFiles: [passCase.target], networkIntent: 'none' });
  const failProfile = createExecutionProfile(project, { name: 'fail', executor: 'node-test', cwdRelative: '.', targetFiles: [failCase.target], networkIntent: 'none' });
  const passPlan = { id: 'plan_pass', version: 1, testcaseIds: [passCase.id] };
  const failPlan = { id: 'plan_fail', version: 1, testcaseIds: [failCase.id] };
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

test('cancels queued runs and rejects cancellation after completion', () => {
  const project = makeProject({ testruns: [{ id: 'queued_1', status: 'queued' }, { id: 'passed_1', status: 'passed' }] });
  assert.equal(cancelRun(project, 'queued_1').status, 'cancelled');
  assert.throws(() => cancelRun(project, 'passed_1'), /无法取消/);
});
