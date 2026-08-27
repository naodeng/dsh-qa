import { uid, now } from '../store.js';

export function normalizeQualityProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new TypeError('项目必须是对象');
  project.qualityTasks ||= [];
  project.qualityAudit ||= [];
  return project;
}

export function createQualityTask(project, fields = {}) {
  normalizeQualityProject(project);
  const task = {
    id: uid('qt'),
    projectId: project.id,
    title: String(fields.title || '未命名质量任务'),
    version: 1,
    stage: 'intake',
    sources: Array.isArray(fields.sources) ? fields.sources : [],
    acceptanceCriteria: Array.isArray(fields.acceptanceCriteria) ? fields.acceptanceCriteria : [],
    risks: Array.isArray(fields.risks) ? fields.risks : [],
    testScope: Array.isArray(fields.testScope) ? fields.testScope : [],
    decisions: Array.isArray(fields.decisions) ? fields.decisions : [],
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
