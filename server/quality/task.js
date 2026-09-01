import { uid, now } from '../store.js';

export function normalizeQualityProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new TypeError('项目必须是对象');
  project.qualityTasks ||= [];
  project.qualityAudit ||= [];
  return project;
}

function capturedSources(sources) {
  if (!Array.isArray(sources)) throw new TypeError('质量任务来源必须是数组');
  return sources.map((source) => {
    if (!source || typeof source !== 'object'
      || typeof source.type !== 'string'
      || typeof source.ref !== 'string'
      || !/^[a-f0-9]{64}$/.test(source.digest)
      || !Number.isSafeInteger(source.byteSize) || source.byteSize < 0
      || typeof source.snapshot !== 'string'
      || typeof source.capturedAt !== 'string') {
      throw new TypeError('质量任务来源必须已采集');
    }
    return { type: source.type, ref: source.ref, digest: source.digest, byteSize: source.byteSize, snapshot: source.snapshot, capturedAt: source.capturedAt };
  });
}

export function createQualityTask(project, { title, sources = [] } = {}) {
  normalizeQualityProject(project);
  const task = {
    id: uid('qt'),
    projectId: project.id,
    title: String(title || '未命名质量任务'),
    version: 1,
    stage: 'intake',
    sources: capturedSources(sources),
    acceptanceCriteria: [],
    risks: [],
    testScope: [],
    decisions: [],
    createdAt: now(),
    updatedAt: now(),
  };
  project.qualityTasks.push(task);
  return task;
}

export function getQualityTask(project, id) {
  normalizeQualityProject(project);
  return project.qualityTasks.find((task) => task.id === id) || null;
}

export function listQualityTasks(project) {
  normalizeQualityProject(project);
  return project.qualityTasks;
}

export function recomputeStage(task) {
  const hasBlockingRisk = (task.risks || []).some((risk) => risk.severity === 'high' || risk.severity === 'critical')
    && (task.risks || []).some((risk) => risk.assessmentStatus === 'confirmed' && risk.dispositionStatus === 'open');
  return hasBlockingRisk ? 'confirmation' : 'intake';
}
