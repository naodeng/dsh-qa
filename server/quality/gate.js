const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'environment-error']);

export function evaluateQualityGate(project) {
  const blockers = [];
  const runs = project.testruns || [];
  if (runs.some((run) => run.status === 'failed')) blockers.push('存在失败测试运行');
  if (runs.some((run) => !TERMINAL.has(run.status))) blockers.push('存在未完成测试运行');
  if ((project.evidenceBundles || []).some((bundle) => bundle.state !== 'ready')) blockers.push('存在未就绪证据包');
  if ((project.risks || []).some((risk) => risk.severity === 'high' && risk.status !== 'closed' && risk.status !== 'accepted')) blockers.push('存在未关闭高风险');
  return { status: blockers.length ? 'blocked' : 'passed', blockers, evaluatedAt: new Date().toISOString() };
}
