import { uid, now } from '../store.js';

export function saveFailureAnalysis(project, testRunId, fields = {}) {
  const run = (project.testruns || []).find((item) => item.id === testRunId);
  if (!run || run.projectId !== project.id || run.status !== 'failed' || run.resultTrust !== 'controlled-local') throw new Error('仅可分析受控失败运行');
  if (!String(fields.summary || '').trim()) throw new Error('故障摘要不能为空');
  const confidence = fields.confidence === undefined || fields.confidence === null || fields.confidence === '' ? null : Number(fields.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('置信度必须在 0 到 1 之间');
  const decision = String(fields.decision || 'candidate');
  if (!['candidate', 'confirmed', 'rejected'].includes(decision)) throw new Error('故障分析决定无效');
  project.failureAnalyses ||= [];
  const historicalDefectIds = [...new Set((Array.isArray(fields.historicalDefectIds) ? fields.historicalDefectIds : []).map((id) => String(id).trim()).filter(Boolean))].sort();
  const analysis = {
    id: uid('failure'), projectId: project.id, version: 1, testRunId, status: 'proposed',
    category: String(fields.category || 'unknown'), summary: String(fields.summary).trim(),
    rootCause: String(fields.rootCause || fields.suspectedCause || ''),
    suspectedCause: String(fields.suspectedCause || fields.rootCause || ''), confidence, decision,
    failureStep: String(fields.failureStep || ''), errorSummary: String(fields.errorSummary || ''),
    historicalDefectIds, createdAt: now(), updatedAt: now(),
  };
  project.failureAnalyses.push(analysis);
  return analysis;
}

export function promoteConfirmedDefect(project, analysisId, { actor = '', actorLabel = '', confirmed = false } = {}) {
  const analysis = (project.failureAnalyses || []).find((item) => item.id === analysisId);
  if (!analysis) throw new Error('故障分析不存在');
  if (analysis.status === 'promoted') throw new Error('分析已升级');
  const confirmedBy = actorLabel || actor;
  if (!confirmed || !String(confirmedBy).trim()) throw new Error('升级缺少人工确认');
  if (analysis.decision === 'rejected') throw new Error('故障分析已拒绝');
  if ((project.defects || []).some((item) => item.failureAnalysisId === analysis.id)) throw new Error('分析已升级');
  const run = (project.testruns || []).find((item) => item.id === analysis.testRunId);
  const defect = { id: uid('defect'), title: analysis.summary || '未命名缺陷', status: 'open', failureAnalysisId: analysis.id, sourceAnalysisId: analysis.id, testRunId: analysis.testRunId, evidenceRefs: [...(run?.evidenceRefs || [])], relatedDefectIds: [...(analysis.historicalDefectIds || [])], createdAt: now() };
  project.defects ||= [];
  project.defects.push(defect);
  analysis.status = 'promoted'; analysis.decision = 'confirmed'; analysis.version += 1; analysis.confirmedBy = String(confirmedBy).trim(); analysis.confirmedAt = now(); analysis.updatedAt = analysis.confirmedAt;
  return defect;
}
