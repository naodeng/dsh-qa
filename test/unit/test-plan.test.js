import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeQualityTask, makeTestCase } from '../helpers/quality-fixtures.js';
import { createPlannedTestCase, createTestPlan, createTestPlanVersion, reviewTestPlan } from '../../server/quality/test-plan.js';

test('links planned cases to one quality task and versions reviewed plans', () => {
  const project = makeProject();
  const task = makeQualityTask({ projectId: project.id });
  task.risks.push({ id: 'risk_1', severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'open' });
  const existing = makeTestCase();
  project.qualityTasks.push(task);
  project.testcases.push(existing);
  const generated = createPlannedTestCase(project, task.id, { title: '支付失败重试', sourceRiskIds: ['risk_1'], automationRef: 'candidate' });
  assert.equal(project.testcases.at(-1).id, generated.id);
  assert.throws(() => createTestPlan(project, 'missing', []), /质量任务不存在/);
  assert.throws(() => createTestPlan(project, task.id, ['foreign-case']), /用例不存在/);
  const plan = createTestPlan(project, task.id, [existing.id]);
  assert.deepEqual(plan.testcaseIds, [existing.id]);
  assert.equal(plan.status, 'draft');
  assert.throws(() => reviewTestPlan(project, plan.id, ''), /确认人/);
  assert.equal(reviewTestPlan(project, plan.id, '张测试').status, 'reviewed');
  const next = createTestPlanVersion(project, plan.id, { testcaseIds: [existing.id, generated.id] });
  assert.equal(plan.status, 'superseded');
  assert.equal(next.status, 'draft');
});
