import fs from 'node:fs/promises';
import path from 'node:path';
import { uid, now } from '../store.js';

const inside = (root, target) => {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

export function enqueueArtifactCleanup(project, { before } = {}) {
  const cutoff = before || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(cutoff))) throw new Error('清理截止时间无效');
  project.artifactCleanupJobs ||= [];
  const job = { id: uid('cleanup'), projectId: project.id, before: cutoff, status: 'queued', deleted: [], createdAt: now() };
  project.artifactCleanupJobs.push(job);
  return job;
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
  job.status = 'completed'; job.completedAt = now();
  return job;
}
