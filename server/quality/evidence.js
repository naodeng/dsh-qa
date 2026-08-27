import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { uid, now } from '../store.js';

const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'environment-error']);
const MAX_FILE = 100 * 1024 * 1024;
const MAX_BUNDLE = 500 * 1024 * 1024;
const MAX_PROJECT = 5 * 1024 * 1024 * 1024;
const finalizations = new WeakMap();

const inside = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

async function filesUnder(root, current = root, output = []) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('证据目录不允许包含符号链接');
    if (entry.isDirectory()) await filesUnder(root, full, output);
    else if (entry.isFile()) output.push({ full, relativePath: path.relative(root, full) });
    else throw new Error('证据目录包含不支持的文件类型');
  }
  return output;
}

async function digestFile(full) {
  const before = await fs.stat(full);
  if (before.nlink > 1) throw new Error('证据文件不允许是硬链接');
  if (before.size > MAX_FILE) throw new Error('单个证据文件超过 100MiB');
  const hash = crypto.createHash('sha256');
  for await (const chunk of (await import('node:fs')).createReadStream(full)) hash.update(chunk);
  const after = await fs.stat(full);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('证据文件在校验期间发生变化');
  return { size: after.size, sha256: hash.digest('hex') };
}

function canonicalManifest(bundle) {
  return JSON.stringify({ id: bundle.id, projectId: bundle.projectId, testRunId: bundle.testRunId, state: 'ready', items: bundle.items, totalSize: bundle.totalSize });
}

function manifestDigest(bundle) {
  return crypto.createHash('sha256').update(canonicalManifest(bundle)).digest('hex');
}

async function writeManifestAtomic(root, bundle) {
  const temporary = path.join(root, 'manifest.json.tmp');
  await fs.writeFile(temporary, canonicalManifest(bundle));
  await fs.rename(temporary, path.join(root, 'manifest.json'));
}

async function finalizeEvidenceOnce(project, testRunId) {
  project.evidenceBundles ||= [];
  const existing = project.evidenceBundles.find((bundle) => bundle.testRunId === testRunId);
  if (existing?.state === 'ready') return existing;
  const run = (project.testruns || []).find((item) => item.id === testRunId);
  if (!run || run.projectId !== project.id) throw new Error('测试运行不存在');
  if (!TERMINAL.has(run.status)) throw new Error('只有终态测试运行才能生成证据');
  const artifactRoot = path.resolve(project.artifactRoot || '');
  const staging = path.resolve(run.artifactDir || '');
  if (!artifactRoot || !staging || !inside(artifactRoot, staging)) throw new Error('证据必须位于受控产物目录');
  const sourceStat = await fs.stat(staging);
  if (!sourceStat.isDirectory()) throw new Error('测试运行产物目录无效');
  const evidenceId = existing?.id || uid('evidence');
  const finalRoot = path.join(artifactRoot, 'evidence', evidenceId);
  const temporaryRoot = `${finalRoot}.finalizing-${process.pid}`;
  await fs.mkdir(path.dirname(finalRoot), { recursive: true });
  await fs.rm(temporaryRoot, { recursive: true, force: true });
  await fs.rename(staging, temporaryRoot);
  try {
    const candidates = await filesUnder(temporaryRoot);
    let total = 0;
    const items = [];
    for (const candidate of candidates) {
      const digest = await digestFile(candidate.full);
      total += digest.size;
      if (total > MAX_BUNDLE) throw new Error('证据包超过 500MiB');
      if (Number(project.artifactUsageBytes || 0) + total > Number(project.artifactQuotaBytes || MAX_PROJECT)) throw new Error('项目产物配额超过 5GiB');
      items.push({ id: uid('evidence_item'), relativePath: candidate.relativePath, ...digest });
    }
    const bundle = { id: evidenceId, projectId: project.id, testRunId, state: 'ready', root: finalRoot, items, totalSize: total, createdAt: existing?.createdAt || now(), updatedAt: now() };
    bundle.manifestSha256 = manifestDigest(bundle);
    await writeManifestAtomic(temporaryRoot, bundle);
    await fs.rm(finalRoot, { recursive: true, force: true });
    await fs.rename(temporaryRoot, finalRoot);
    project.artifactUsageBytes = Number(project.artifactUsageBytes || 0) + total;
    const index = project.evidenceBundles.findIndex((item) => item.testRunId === testRunId);
    if (index >= 0) project.evidenceBundles[index] = bundle;
    else project.evidenceBundles.push(bundle);
    return bundle;
  } catch (error) {
    try { await fs.rename(temporaryRoot, staging); } catch { /* recovery removes an incomplete claim */ }
    throw error;
  }
}

export function finalizeEvidence(project, testRunId) {
  let locks = finalizations.get(project);
  if (!locks) { locks = new Map(); finalizations.set(project, locks); }
  const existing = locks.get(testRunId);
  if (existing) return existing;
  const promise = finalizeEvidenceOnce(project, testRunId).finally(() => locks.delete(testRunId));
  locks.set(testRunId, promise);
  return promise;
}

export async function verifyEvidence(bundle) {
  if (!bundle || bundle.state !== 'ready') return { ok: false, reason: '证据包未就绪' };
  try {
    const manifestPath = path.join(bundle.root, 'manifest.json');
    const storedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (canonicalManifest(storedManifest) !== canonicalManifest(bundle)) return { ok: false, reason: '证据清单完整性校验失败' };
    if (bundle.manifestSha256 && manifestDigest(bundle) !== bundle.manifestSha256) return { ok: false, reason: '证据清单完整性校验失败' };
    for (const item of bundle.items || []) {
      const actual = await digestFile(path.join(bundle.root, item.relativePath));
      if (actual.size !== item.size || actual.sha256 !== item.sha256) return { ok: false, reason: '证据完整性校验失败' };
    }
    return { ok: true };
  } catch (error) { return { ok: false, reason: error.message }; }
}

export function resolveEvidence(project, evidenceId) {
  return (project.evidenceBundles || []).find((bundle) => bundle.id === evidenceId && bundle.state === 'ready') || null;
}

export async function recoverEvidenceFinalization(projects) {
  for (const project of projects || []) {
    const root = path.join(path.resolve(project.artifactRoot || ''), 'evidence');
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    const ready = new Set((project.evidenceBundles || []).filter((bundle) => bundle.state === 'ready').map((bundle) => bundle.id));
    for (const entry of entries) {
      if (!entry.isDirectory() || ready.has(entry.name)) continue;
      const candidateRoot = path.join(root, entry.name);
      if (entry.name.endsWith('.tmp') || entry.name.includes('.finalizing-')) {
        await fs.rm(candidateRoot, { recursive: true, force: true });
        continue;
      }
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(candidateRoot, 'manifest.json'), 'utf8'));
        const recovered = { ...manifest, root: candidateRoot, manifestSha256: manifestDigest(manifest), createdAt: manifest.createdAt || now(), updatedAt: now() };
        if (manifest.id !== entry.name || manifest.projectId !== project.id || !(await verifyEvidence(recovered)).ok) throw new Error('invalid manifest');
        project.evidenceBundles.push(recovered);
      } catch {
        await fs.rm(candidateRoot, { recursive: true, force: true });
      }
    }
    project.evidenceBundles = (project.evidenceBundles || []).filter((bundle) => bundle.state === 'ready');
  }
  return projects;
}
