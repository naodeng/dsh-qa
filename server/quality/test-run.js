import { now, uid } from '../store.js';

const MODES = new Set(['imported', 'local']);
const STATUSES = new Set(['queued', 'running', 'passed', 'failed', 'cancelled', 'unknown', 'environment-error']);

export function normalizeTestRun(run) {
  if (!run || typeof run !== 'object') throw new TypeError('测试运行必须是对象');
  run.mode = MODES.has(run.mode) ? run.mode : 'imported';
  run.status = STATUSES.has(run.status) ? run.status : run.mode === 'imported' ? 'unknown' : 'queued';
  run.resultTrust ||= run.mode === 'imported' ? 'imported-summary' : 'controlled-local';
  run.provenance ||= {};
  return run;
}

export function normalizeTestRunProject(project) {
  project.testruns ||= [];
  project.executionProfiles ||= [];
  project.testPlans ||= [];
  for (const run of project.testruns) normalizeTestRun(run);
  return project;
}

export function createTestRun(project, fields = {}) {
  normalizeTestRunProject(project);
  const mode = fields.mode === 'local' ? 'local' : 'imported';
  const run = normalizeTestRun({
    id: uid('run'), projectId: project.id, mode, executor: String(fields.executor || ''), summary: String(fields.summary || ''),
    status: mode === 'imported' ? 'unknown' : 'queued', resultTrust: mode === 'imported' ? 'imported-summary' : 'controlled-local',
    provenance: fields.provenance && typeof fields.provenance === 'object' ? fields.provenance : {}, createdAt: now(), updatedAt: now(),
  });
  project.testruns.push(run);
  project.materials ||= [];
  project.materials.unshift({ id: run.id, ts: run.createdAt, type: 'run', label: `导入 ${run.executor || '测试'} 测试结果：${run.summary}` });
  project.materials = project.materials.slice(0, 6);
  return run;
}
