import { broadcast } from '../sse.js';
import { now, persist, touch, uid } from '../store.js';

function taskFor(project, taskId) {
  return project?.qualityTasks?.find((task) => task.id === taskId && task.projectId === project.id) || null;
}

export function createAnalysisRequest(project, taskId) {
  const task = taskFor(project, taskId);
  if (!task) return null;
  project.analysisRequests ||= [];
  const request = { id: uid('analysis'), taskId, expectedRevision: task.version, sourceDigests: task.sources.map((source) => source.digest), createdAt: now(), status: 'pending' };
  project.analysisRequests.push(request);
  return request;
}

export function appendDeniedAudit(project, task, reason) {
  project.qualityAudit ||= [];
  const createdAt = now();
  project.qualityAudit.push({ id: uid('audit'), entityType: 'quality-task', entityId: task.id, taskId: task.id, action: 'mutation-denied', source: 'dsh-tool', actorLabel: '', dshSessionId: '', fromRevision: task.version, toRevision: task.version, result: 'denied', errorCode: reason, reason, createdAt, at: createdAt });
  return project.qualityAudit.at(-1);
}

export function commitQualityMutation(project, taskId, expectedRevision, mutation, metadata = {}) {
  const task = taskFor(project, taskId);
  if (!task || task.version !== expectedRevision) return null;
  const fromRevision = task.version;
  mutation(task);
  task.version += 1;
  task.updatedAt = now();
  project.qualityAudit ||= [];
  const createdAt = now();
  project.qualityAudit.push({ id: uid('audit'), entityType: 'quality-task', entityId: taskId, taskId, action: metadata.action || 'update', source: metadata.source || 'dsh-tool', actorLabel: metadata.actorLabel || '', dshSessionId: '', fromRevision, toRevision: task.version, result: 'success', errorCode: '', createdAt, at: createdAt });
  touch(project);
  persist();
  broadcast('quality.task.updated', { projectId: project.id, entityId: taskId, revision: task.version, updatedAt: task.updatedAt });
  return task;
}

export async function saveAnalysis(result, project) {
  const request = project?.analysisRequests?.find((item) => item.id === result.analysisRequestId);
  const task = request && taskFor(project, request.taskId);
  if (!request || !task) return { ok: false, code: 'QUALITY_ANALYSIS_NOT_FOUND' };
  const expected = task.sources.map((source) => source.digest).sort();
  const received = Array.isArray(result.sourceDigests) ? [...result.sourceDigests].sort() : [];
  if (expected.join('|') !== received.join('|')) {
    appendDeniedAudit(project, task, 'QUALITY_SOURCE_CHANGED');
    return { ok: false, code: 'QUALITY_SOURCE_CHANGED' };
  }
  if (task.version !== result.expectedRevision) {
    appendDeniedAudit(project, task, 'QUALITY_REVISION_CONFLICT');
    return { ok: false, code: 'QUALITY_REVISION_CONFLICT' };
  }
  const saved = commitQualityMutation(project, task.id, result.expectedRevision, (target) => {
    target.risks = Array.isArray(result.risks) ? result.risks : [];
    target.acceptanceCriteria = Array.isArray(result.acceptanceCriteria) ? result.acceptanceCriteria : [];
    target.testScope = Array.isArray(result.testScope) ? result.testScope : [];
    target.analysisOrigin = result.origin === 'agent' ? 'agent' : 'manual';
    target.analysisRuns ||= [];
    target.analysisRuns.push({ at: now(), origin: target.analysisOrigin, dshSessionId: '' });
  });
  request.status = 'committed';
  return { ok: true, task: saved };
}
