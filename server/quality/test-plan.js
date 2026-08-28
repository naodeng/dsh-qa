import { now, uid } from '../store.js';

function taskFor(project, id) {
  const task = project.qualityTasks?.find((item) => item.id === id && item.projectId === project.id);
  if (!task) throw new Error('质量任务不存在');
  return task;
}

function testcaseFor(project, id) {
  const testcase = project.testcases?.find((item) => item.id === id);
  if (!testcase) throw new Error('用例不存在');
  return testcase;
}

export function createPlannedTestCase(project, qualityTaskId, fields = {}) {
  const task = taskFor(project, qualityTaskId);
  const sourceRiskIds = Array.isArray(fields.sourceRiskIds) ? fields.sourceRiskIds : [];
  for (const riskId of sourceRiskIds) if (!(task.risks || []).some((risk) => risk.id === riskId)) throw new Error('风险不存在');
  const testcase = { id: uid('tc'), title: String(fields.title || '未命名测试用例'), planIds: [], qualityTaskId, sourceRiskIds, automationRef: String(fields.automationRef || ''), status: 'draft', at: now() };
  project.testcases.push(testcase);
  return testcase;
}

export function createTestPlan(project, qualityTaskId, testcaseIds = []) {
  taskFor(project, qualityTaskId);
  const ids = [...new Set(testcaseIds)];
  for (const id of ids) testcaseFor(project, id);
  project.testPlans ||= [];
  const plan = { id: uid('plan'), qualityTaskId, version: 1, testcaseIds: ids, status: 'draft', createdAt: now(), updatedAt: now() };
  project.testPlans.push(plan);
  for (const id of ids) { const testcase = testcaseFor(project, id); testcase.planIds ||= []; if (!testcase.planIds.includes(plan.id)) testcase.planIds.push(plan.id); }
  return plan;
}

export function getTestPlan(project, id) { return project.testPlans?.find((plan) => plan.id === id) || null; }

export function isCurrentTestPlan(project, plan) {
  if (!plan) return false;
  if (!plan.qualityTaskId) return true;
  const versions = (project.testPlans || []).filter((item) => item.qualityTaskId === plan.qualityTaskId);
  const currentVersion = Math.max(...versions.map((item) => Number(item.version || 0)));
  return Number(plan.version || 0) === currentVersion;
}

export function reviewTestPlan(project, planId, actorLabel) {
  const plan = getTestPlan(project, planId);
  if (!plan) throw new Error('测试计划不存在');
  if (plan.status === 'superseded' || !isCurrentTestPlan(project, plan)) throw new Error('已废弃的测试计划不是当前版本，不能重新评审');
  if (!String(actorLabel || '').trim()) throw new Error('需要确认人');
  plan.status = 'reviewed'; plan.reviewedBy = String(actorLabel).trim(); plan.reviewedAt = now(); plan.updatedAt = now();
  return plan;
}

export function createTestPlanVersion(project, planId, fields = {}) {
  const previous = getTestPlan(project, planId);
  if (!previous) throw new Error('测试计划不存在');
  const next = createTestPlan(project, previous.qualityTaskId, fields.testcaseIds || previous.testcaseIds);
  next.version = previous.version + 1;
  previous.status = 'superseded'; previous.updatedAt = now();
  return next;
}
