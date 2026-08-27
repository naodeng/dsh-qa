import { uid, now } from '../store.js';

export function createRegressionSet(project, { name = '', testCaseIds = [] } = {}) {
  project.regressionSets ||= [];
  const valid = new Set((project.testcases || []).map((item) => item.id));
  const set = { id: uid('regression'), projectId: project.id, name: String(name), testCaseIds: [...new Set(testCaseIds.filter((id) => valid.has(id)))].sort(), exclusions: [], createdAt: now(), updatedAt: now() };
  project.regressionSets.push(set);
  return set;
}

export function excludeRegressionCase(set, testCaseId, { actor = '', reason = '' } = {}) {
  if (!actor || !reason) throw new Error('排除必须记录操作者和理由');
  if (!set.testCaseIds.includes(testCaseId)) throw new Error('回归用例不存在');
  set.exclusions = (set.exclusions || []).filter((item) => item.testCaseId !== testCaseId);
  set.exclusions.push({ testCaseId, actor, reason });
  set.updatedAt = now();
  return set;
}
