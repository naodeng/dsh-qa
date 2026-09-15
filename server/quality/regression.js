import { uid, now } from '../store.js';
import crypto from 'node:crypto';

export function createRegressionSet(project, { name = '', testCaseIds = [] } = {}) {
  project.regressionSets ||= [];
  const valid = new Set((project.testcases || []).map((item) => item.id));
  const requested = [...new Set(Array.isArray(testCaseIds) ? testCaseIds : [])];
  const invalid = requested.filter((id) => !valid.has(id));
  if (invalid.length) throw new Error(`回归用例不存在：${invalid.join('、')}`);
  const sorted = requested.sort();
  const set = { id: uid('regression'), projectId: project.id, version: 1, name: String(name), status: 'manual', qualityTaskId: '', reasonRefs: [], testCaseIds: sorted, cases: sorted.map((testCaseId) => ({ testCaseId, included: true })), exclusions: [], createdAt: now(), updatedAt: now() };
  project.regressionSets.push(set);
  return set;
}

export function excludeRegressionCase(set, testCaseId, { actor = '', reason = '' } = {}) {
  if (!String(actor).trim() || !String(reason).trim()) throw new Error('排除必须记录操作者和理由');
  if (!set.testCaseIds.includes(testCaseId)) throw new Error('回归用例不存在');
  set.exclusions = (set.exclusions || []).filter((item) => item.testCaseId !== testCaseId);
  set.exclusions.push({ testCaseId, actor: String(actor).trim(), reason: String(reason).trim() });
  set.cases = (set.cases || set.testCaseIds.map((id) => ({ testCaseId: id, included: true }))).map((item) => item.testCaseId === testCaseId ? { ...item, included: false } : item);
  set.version = (set.version || 1) + 1;
  set.updatedAt = now();
  return set;
}

export function calculateRegressionSet(project, qualityTaskId, inputDigest = '') {
  const task = (project.qualityTasks || []).find((item) => item.id === qualityTaskId);
  if (!task) throw new Error('质量任务不存在');
  const requirementIds = (project.requirements || []).map((item) => item.id).sort();
  const riskIds = (task?.risks || []).map((item) => item.id || item).map(String).sort();
  const defectIds = (project.defects || []).filter((item) => item.status !== 'closed').map((item) => item.id).sort();
  const testCaseIds = (project.testcases || []).map((item) => item.id).sort();
  const reasonRefs = [
    ...(inputDigest ? [`change:${inputDigest}`] : []),
    ...defectIds.map((id) => `defect:${id}`),
    ...requirementIds.map((id) => `requirement:${id}`),
    ...riskIds.map((id) => `risk:${id}`),
  ].sort();
  const canonical = JSON.stringify({ qualityTaskId, inputDigest, requirementIds, riskIds, defectIds, testCaseIds });
  return {
    id: `regression_${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`,
    projectId: project.id, qualityTaskId, inputDigest, version: 1, status: 'calculated', reasonRefs,
    testCaseIds, cases: testCaseIds.map((testCaseId) => ({ testCaseId, included: true })),
    references: { requirementIds, defectIds }, exclusions: [], createdAt: null, updatedAt: null,
  };
}

export function recalculateRegressionSet(project, regressionSetId, inputDigest = '') {
  const set = (project.regressionSets || []).find((item) => item.id === regressionSetId);
  if (!set) throw new Error('回归集不存在');
  const calculated = calculateRegressionSet(project, set.qualityTaskId, inputDigest);
  const exclusions = set.exclusions || [];
  Object.assign(set, calculated, { id: set.id, name: set.name, version: (set.version || 1) + 1, exclusions, createdAt: set.createdAt || now(), updatedAt: now() });
  const excluded = new Set(exclusions.map((item) => item.testCaseId));
  set.cases = set.cases.map((item) => ({ ...item, included: !excluded.has(item.testCaseId) }));
  return set;
}
