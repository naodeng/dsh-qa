import fs from 'node:fs/promises';
import path from 'node:path';
import { uid, now } from '../store.js';
import { recalculateArtifactUsage } from './evidence.js';

const inside = (root, target) => {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

async function controlledRoot(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) return null;
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) return null;
  const stat = await fs.lstat(resolved).catch(() => null);
  if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) return null;
  return stat ? fs.realpath(resolved) : resolved;
}

function protectedEvidenceIds(project) {
  const protectedIds = new Set();
  for (const defect of project.defects || []) {
    if (defect.status !== 'closed') for (const id of defect.evidenceRefs || []) protectedIds.add(id);
  }
  const latestGate = (project.gates || []).filter((gate) => gate.kind === 'computed').at(-1);
  for (const id of latestGate?.evidenceRefs || []) protectedIds.add(id);
  for (const check of latestGate?.checks || []) for (const id of check.evidenceRefs || []) protectedIds.add(id);
  return protectedIds;
}

function safeCleanupError(error, fallback = '证据清理失败') {
  const message = String(error?.message || fallback);
  return /[/\\]|\bE[A-Z]+\b/.test(message) ? fallback : message;
}

function removeEvidenceReferences(project, ids) {
  const removed = new Set(ids);
  project.evidenceBundles = (project.evidenceBundles || []).filter((bundle) => !removed.has(bundle.id));
  for (const run of project.testruns || []) if (Array.isArray(run.evidenceRefs)) run.evidenceRefs = run.evidenceRefs.filter((id) => !removed.has(id));
  recalculateArtifactUsage(project);
}

export function enqueueArtifactCleanup(project, { before } = {}) {
  const cutoff = before || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(cutoff))) throw new Error('清理截止时间无效');
  project.artifactCleanupJobs ||= [];
  const createdAt = now();
  const job = { id: uid('cleanup'), projectId: project.id, artifactRoot: project.artifactRoot || '', before: cutoff, status: 'queued', attempts: 0, deleted: [], createdAt, updatedAt: createdAt };
  project.artifactCleanupJobs.push(job);
  return job;
}

export async function executeArtifactCleanup(job, deps = { rm: fs.rm }) {
  job.attempts = Number(job.attempts || 0) + 1;
  const artifactRoot = await controlledRoot(job.artifactRoot);
  if (!artifactRoot) {
    job.status = 'failed'; job.updatedAt = now();
    job.lastError = '清理目标不在受控产物目录';
    return job;
  }
  try {
    await deps.rm(artifactRoot, { recursive: true, force: true });
    job.status = 'completed'; job.completedAt = now(); job.updatedAt = job.completedAt;
  } catch (error) {
    job.status = 'retryable'; job.lastError = safeCleanupError(error); job.updatedAt = now();
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
    const root = await controlledRoot(project.artifactRoot);
    if (!root) continue;
    const knownStaging = new Set();
    for (const run of project.testruns || []) {
      const artifactDir = run.artifactDir;
      if (typeof artifactDir !== 'string' || !path.isAbsolute(artifactDir)) continue;
      knownStaging.add(await fs.realpath(path.resolve(artifactDir)).catch(() => path.resolve(artifactDir)));
    }
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const candidate = path.join(root, entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.staging') && !knownStaging.has(await fs.realpath(candidate).catch(() => path.resolve(candidate)))) await fs.rm(candidate, { recursive: true, force: true });
    }
  }
  return projects;
}

export async function runArtifactCleanup(project, jobId) {
  const job = (project.artifactCleanupJobs || []).find((item) => item.id === jobId);
  if (!job) throw new Error('清理任务不存在');
  if (job.status === 'completed') return job;
  job.status = 'running';
  const root = await controlledRoot(project.artifactRoot);
  if (!root) { job.status = 'failed'; job.lastError = '清理目标不在受控产物目录'; throw new Error(job.lastError); }
  const protectedIds = protectedEvidenceIds(project);
  for (const bundle of [...(project.evidenceBundles || [])]) {
    if (bundle.state !== 'ready' || bundle.referenced || protectedIds.has(bundle.id) || !bundle.createdAt || Date.parse(bundle.createdAt) >= Date.parse(job.before)) continue;
    if (job.deleted.includes(bundle.id)) { removeEvidenceReferences(project, [bundle.id]); continue; }
    const bundleRoot = await controlledRoot(bundle.root);
    if (!bundleRoot || !inside(root, bundleRoot)) { job.status = 'failed'; job.lastError = '清理目标不在受控产物目录'; job.updatedAt = now(); throw new Error(job.lastError); }
    try { await fs.rm(bundleRoot, { recursive: true, force: true }); }
    catch (error) { job.status = 'retryable'; job.lastError = safeCleanupError(error); job.updatedAt = now(); throw new Error(job.lastError); }
    if (!job.deleted.includes(bundle.id)) job.deleted.push(bundle.id);
    removeEvidenceReferences(project, [bundle.id]);
  }
  job.status = 'completed'; job.completedAt = now(); job.updatedAt = job.completedAt;
  return job;
}
