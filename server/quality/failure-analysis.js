import { uid, now } from '../store.js';

export function saveFailureAnalysis(project, testRunId, fields = {}) {
  const run = (project.testruns || []).find((item) => item.id === testRunId);
  if (!run || run.projectId !== project.id || run.status !== 'failed' || run.resultTrust !== 'controlled-local') throw new Error('仅可分析受控失败运行');
  project.failureAnalyses ||= [];
  const analysis = { id: uid('failure'), projectId: project.id, version: 1, testRunId, status: 'proposed', category: String(fields.category || 'unknown'), summary: String(fields.summary || ''), rootCause: String(fields.rootCause || ''), createdAt: now(), updatedAt: now() };
  project.failureAnalyses.push(analysis);
  return analysis;
}

export function promoteConfirmedDefect(project, analysisId, { actor = '', confirmed = false } = {}) {
  const analysis = (project.failureAnalyses || []).find((item) => item.id === analysisId);
  if (!analysis) throw new Error('故障分析不存在');
  if (analysis.status === 'promoted') throw new Error('分析已升级');
  if (!confirmed || !actor) throw new Error('升级缺少人工确认');
  const defect = { id: uid('defect'), title: analysis.summary || '未命名缺陷', status: 'open', sourceAnalysisId: analysis.id, createdAt: now() };
  project.defects ||= [];
  project.defects.push(defect);
  analysis.status = 'promoted'; analysis.version += 1; analysis.confirmedBy = actor; analysis.confirmedAt = now();
  return defect;
}
