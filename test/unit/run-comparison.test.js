import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { compareRuns } from '../../server/quality/run-comparison.js';

test('compares terminal runs under the same plan with deterministic case changes', () => {
  const project = makeProject();
  const before = makeTestRun({ projectId: project.id, status: 'passed', testPlanId: 'plan-1', evidenceRefs: ['ev-before'], cases: [{ id: 'b', status: 'passed' }, { id: 'a', status: 'failed' }] });
  const after = makeTestRun({ projectId: project.id, status: 'failed', testPlanId: 'plan-1', evidenceRefs: ['ev-after'], cases: [{ id: 'a', status: 'passed' }, { id: 'b', status: 'failed' }] });
  project.testruns.push(before, after);
  const result = compareRuns(project, before.id, after.id);
  assert.equal(result.samePlan, true);
  assert.deepEqual(result.changedCases, [
    { caseId: 'a', before: 'failed', after: 'passed', classification: 'fixed' },
    { caseId: 'b', before: 'passed', after: 'failed', classification: 'new-failure' },
  ]);
  assert.deepEqual(result.evidenceRefs, ['ev-before', 'ev-after']);
});

test('rejects non-terminal, cross-project, and cross-plan comparisons', () => {
  const project = makeProject();
  const first = makeTestRun({ projectId: project.id, status: 'passed', testPlanId: 'plan-1' });
  const queued = makeTestRun({ projectId: project.id, status: 'queued', testPlanId: 'plan-1' });
  const otherPlan = makeTestRun({ projectId: project.id, status: 'passed', testPlanId: 'plan-2' });
  project.testruns.push(first, queued, otherPlan);
  assert.throws(() => compareRuns(project, first.id, queued.id), /终态/);
  assert.throws(() => compareRuns(project, first.id, otherPlan.id), /同一测试计划/);
  assert.throws(() => compareRuns(project, first.id, 'missing'), /不存在/);
});
