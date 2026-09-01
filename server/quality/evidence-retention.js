import fs from 'node:fs/promises';
import path from 'node:path';
import { uid, now } from '../store.js';
import { recalculateArtifactUsage } from './evidence.js';

const inside = (root, target) => {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

export function enqueueArtifactCleanup(project, { before } = {}) {
  const cutoff = before || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(cutoff))) throw new Error('清理截止时间无效');
  project.artifactCleanupJobs ||= [];
  const job = { id: uid('cleanup'), projectId: project.id, artifactRoot: project.artifactRoot || '', before: cutoff, status: 'queued', attempts: 0, deleted: [], createdAt: now() };
  project.artifactCleanupJobs.push(job);
  return job;
}

export async function executeArtifactCleanup(job, deps = { rm: fs.rm }) {
  job.attempts = Number(job.attempts || 0) + 1;
  try {
    await deps.rm(job.artifactRoot, { recursive: true, force: true });
    job.status = 'completed'; job.completedAt = now();
  } catch (error) {
    job.status = 'retryable'; job.lastError = error.message;
  }
  return job;
}

export function startArtifactCleanupWorker({ jobs = [], intervalMs = 60_000, batchSize = 10, deps, projectExists = () => false, onChange = () => {} } = {}) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const pending = jobs.filter((job) => !projectExists(job.projectId) && (job.status === 'queued' || job.status === 'retryable')).slice(0, batchSize);
    let changed = false;
    for (const job of pending) {
      await executeArtifactCleanup(job, deps);
      changed = true;
      if (job.status === 'completed') jobs.splice(jobs.indexOf(job), 1);
    }
    if (changed) onChange();
  };
  const timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  timer.unref?.();
  tick().catch(() => {});
  return { stop() { stopped = true; clearInterval(timer); } };
}

export async function recoverOrphanStaging(projects) {
  for (const project of projects || []) {
    const root = path.resolve(project.artifactRoot || '');
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) if (entry.isDirectory() && entry.name.endsWith('.staging')) await fs.rm(path.join(root, entry.name), { recursive: true, force: true });
  }
  return projects;
}

export async function runArtifactCleanup(project, jobId) {
  const job = (project.artifactCleanupJobs || []).find((item) => item.id === jobId);
  if (!job) throw new Error('清理任务不存在');
  if (job.status === 'completed') return job;
  job.status = 'running';
  const root = path.resolve(project.artifactRoot || '');
  for (const bundle of project.evidenceBundles || []) {
    if (bundle.state !== 'ready' || bundle.referenced || !bundle.createdAt || Date.parse(bundle.createdAt) >= Date.parse(job.before)) continue;
    const bundleRoot = path.resolve(bundle.root || '');
    if (!inside(root, bundleRoot)) { job.status = 'failed'; throw new Error('清理目标不在受控产物目录'); }
    await fs.rm(bundleRoot, { recursive: true, force: false });
    job.deleted.push(bundle.id);
  }
  if (job.deleted.length) {
    const removed = new Set(job.deleted);
    project.evidenceBundles = (project.evidenceBundles || []).filter((bundle) => !removed.has(bundle.id));
    for (const run of project.testruns || []) if (Array.isArray(run.evidenceRefs)) run.evidenceRefs = run.evidenceRefs.filter((id) => !removed.has(id));
    recalculateArtifactUsage(project);
  }
  job.status = 'completed'; job.completedAt = now();
  return job;
}
