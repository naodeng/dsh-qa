const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'environment-error']);

export function compareRuns(project, beforeId, afterId) {
  const runs = project.testruns || [];
  const before = runs.find((run) => run.id === beforeId);
  const after = runs.find((run) => run.id === afterId);
  if (!before || !after) throw new Error('测试运行不存在');
  if (before.projectId !== project.id || after.projectId !== project.id) throw new Error('测试运行不属于当前项目');
  if (!TERMINAL.has(before.status) || !TERMINAL.has(after.status)) throw new Error('只能比较终态测试运行');
  if (!before.testPlanId || before.testPlanId !== after.testPlanId) throw new Error('只能比较同一测试计划');
  const beforeCases = new Map((before.cases || []).map((item) => [item.id, item.status]));
  const afterCases = new Map((after.cases || []).map((item) => [item.id, item.status]));
  const ids = [...new Set([...beforeCases.keys(), ...afterCases.keys()])].sort();
  const changedCases = ids
    .filter((id) => beforeCases.get(id) !== afterCases.get(id))
    .map((caseId) => {
      const before = beforeCases.get(caseId) || 'missing';
      const after = afterCases.get(caseId) || 'missing';
      const classification = before === 'failed' && after === 'passed' ? 'fixed' : before === 'passed' && after === 'failed' ? 'new-failure' : 'changed';
      return { caseId, before, after, classification };
    });
  const evidenceRefs = [...new Set([...(before.evidenceRefs || []), ...(after.evidenceRefs || [])])];
  return { beforeRunId: before.id, afterRunId: after.id, testPlanId: before.testPlanId, samePlan: true, changedCases, evidenceRefs };
}
