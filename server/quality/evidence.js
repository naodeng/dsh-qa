import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { uid, now } from '../store.js';

const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'environment-error']);
const MAX_FILE = 100 * 1024 * 1024;
const MAX_BUNDLE = 500 * 1024 * 1024;
const MAX_PROJECT = 5 * 1024 * 1024 * 1024;
const finalizations = new WeakMap();

const MIME_BY_EXTENSION = {
  '.log': 'text/plain',
  '.txt': 'text/plain',
  '.tap': 'text/plain',
  '.out': 'text/plain',
  '.md': 'text/plain',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
};

const inside = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

async function filesUnder(root, current = root, output = []) {
  const entries = (await fs.readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('证据目录不允许包含符号链接');
    if (entry.isDirectory()) await filesUnder(root, full, output);
    else if (entry.isFile()) output.push({ full, relativePath: path.relative(root, full) });
    else throw new Error('证据目录包含不支持的文件类型');
  }
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function getEvidenceItemMetadata(relativePath = '') {
  const extension = path.extname(relativePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  const type = mimeType.startsWith('image/')
    ? 'screenshot'
    : mimeType === 'application/zip'
      ? 'trace'
      : mimeType.startsWith('text/') || mimeType === 'application/json'
        ? 'log'
        : 'artifact';
  return { type, mimeType };
}

async function controlledArtifactRoot(project) {
  const configured = project?.artifactRoot;
  if (typeof configured !== 'string' || !path.isAbsolute(configured)) throw new Error('证据必须位于受控产物目录');
  const root = path.resolve(configured);
  if (root === path.parse(root).root) throw new Error('证据必须位于受控产物目录');
  const rootStat = await fs.lstat(root).catch(() => null);
  if (rootStat?.isSymbolicLink() || (rootStat && !rootStat.isDirectory())) throw new Error('证据必须位于受控产物目录');
  await fs.mkdir(root, { recursive: true });
  return fs.realpath(root);
}

function provenanceMatches(left = {}, right = {}) {
  return JSON.stringify(canonicalProvenance(left)) === JSON.stringify(canonicalProvenance(right));
}

function failIntegrity(bundle, reason) {
  bundle.state = 'integrity-failed';
  bundle.integrity = 'failed';
  bundle.integrityError = String(reason || '证据完整性校验失败');
  bundle.revision = (bundle.revision || 1) + 1;
  bundle.updatedAt = now();
}

async function digestFile(full) {
  const before = await fs.lstat(full);
  if (!before.isFile()) throw new Error('证据文件必须是普通文件');
  if (before.nlink > 1) throw new Error('证据文件不允许是硬链接');
  if (before.size > MAX_FILE) throw new Error('单个证据文件超过 100MiB');
  const handle = await fs.open(full, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
  const hash = crypto.createHash('sha256');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw new Error('证据文件在打开时发生变化');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.dev !== after.dev || opened.ino !== after.ino) throw new Error('证据文件在校验期间发生变化');
    return { size: after.size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}

export function recalculateArtifactUsage(project) {
  project.artifactUsageBytes = (project.evidenceBundles || []).filter((bundle) => bundle.state === 'ready').reduce((total, bundle) => total + Number(bundle.totalSize || 0), 0);
  return project.artifactUsageBytes;
}

function canonicalManifest(bundle) {
  const items = [...(bundle.items || [])].sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath)));
  return JSON.stringify({
    id: bundle.id,
    projectId: bundle.projectId,
    testRunId: bundle.testRunId,
    state: 'ready',
    provenance: canonicalProvenance(bundle.provenance || {}),
    commit: bundle.commit ?? bundle.provenance?.commit ?? null,
    items,
    totalSize: bundle.totalSize,
  });
}

function manifestDigest(bundle) {
  return crypto.createHash('sha256').update(canonicalManifest(bundle)).digest('hex');
}

function legacyCanonicalManifest(bundle) {
  return JSON.stringify({ id: bundle.id, projectId: bundle.projectId, testRunId: bundle.testRunId, state: 'ready', items: bundle.items, totalSize: bundle.totalSize });
}

function legacyManifestDigest(bundle) {
  return crypto.createHash('sha256').update(legacyCanonicalManifest(bundle)).digest('hex');
}

function canonicalProvenance(provenance = {}) {
  return Object.fromEntries(Object.entries(provenance)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, key === 'sourceDigests' && Array.isArray(value) ? [...value].sort() : value]));
}

async function writeManifestAtomic(root, bundle) {
  const temporary = path.join(root, 'manifest.json.tmp');
  await fs.writeFile(temporary, canonicalManifest(bundle));
  await fs.rename(temporary, path.join(root, 'manifest.json'));
}

async function finalizeEvidenceOnce(project, testRunId) {
  project.evidenceBundles ||= [];
  const existing = project.evidenceBundles.find((bundle) => bundle.testRunId === testRunId);
  if (existing?.state === 'ready') {
    const integrity = await verifyEvidence(existing);
    if (integrity.ok) return existing;
    failIntegrity(existing, integrity.reason);
    throw new Error(`证据完整性校验失败：${integrity.reason}`);
  }
  const run = (project.testruns || []).find((item) => item.id === testRunId);
  if (!run || run.projectId !== project.id) throw new Error('测试运行不存在');
  if (!TERMINAL.has(run.status)) throw new Error('只有终态测试运行才能生成证据');
  const artifactRoot = await controlledArtifactRoot(project);
  const configuredStaging = run.artifactDir;
  if (typeof configuredStaging !== 'string' || !path.isAbsolute(configuredStaging)) throw new Error('证据必须位于受控产物目录');
  const stagingPath = path.resolve(configuredStaging);
  const stagingStat = await fs.lstat(stagingPath).catch(() => null);
  if (!stagingStat || stagingStat.isSymbolicLink()) throw new Error('证据目录不允许是符号链接');
  const staging = await fs.realpath(stagingPath);
  if (!inside(artifactRoot, staging)) throw new Error('证据必须位于受控产物目录');
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
      items.push({ id: uid('evidence_item'), relativePath: candidate.relativePath, ...getEvidenceItemMetadata(candidate.relativePath), ...digest, capturedAt: now() });
    }
    const provenance = structuredClone(run.provenance || {});
    const verifiedAt = now();
    const bundle = {
      id: evidenceId,
      projectId: project.id,
      testRunId,
      revision: existing?.revision || 1,
      state: 'ready',
      integrity: 'verified',
      provenance,
      commit: provenance.commit ?? null,
      verifiedAt,
      root: finalRoot,
      items,
      totalSize: total,
      createdAt: existing?.createdAt || verifiedAt,
      updatedAt: verifiedAt,
    };
    bundle.manifestHash = manifestDigest(bundle);
    bundle.manifestSha256 = bundle.manifestHash;
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
    const rootStat = await fs.lstat(bundle.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return { ok: false, reason: '证据根目录无效' };
    const root = await fs.realpath(bundle.root);
    const manifestPath = path.join(bundle.root, 'manifest.json');
    const manifestStat = await fs.lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) return { ok: false, reason: '证据清单无效' };
    const storedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const currentManifestMatches = canonicalManifest(storedManifest) === canonicalManifest(bundle);
    const legacyManifestMatches = !bundle.manifestHash && canonicalManifest(storedManifest) !== canonicalManifest(bundle)
      && legacyCanonicalManifest(storedManifest) === legacyCanonicalManifest(bundle);
    if (!currentManifestMatches && !legacyManifestMatches) return { ok: false, reason: '证据清单完整性校验失败' };
    const expectedManifestHash = bundle.manifestHash || bundle.manifestSha256;
    if (expectedManifestHash && manifestDigest(bundle) !== expectedManifestHash && (!bundle.manifestHash ? legacyManifestDigest(bundle) !== expectedManifestHash : true)) return { ok: false, reason: '证据清单完整性校验失败' };
    for (const item of bundle.items || []) {
      if (typeof item.relativePath !== 'string' || !item.relativePath || path.isAbsolute(item.relativePath) || item.relativePath.split(/[\\/]/).includes('..')) return { ok: false, reason: '证据文件路径无效' };
      const file = path.resolve(bundle.root, item.relativePath);
      if (!inside(bundle.root, file)) return { ok: false, reason: '证据文件路径越界' };
      const realFile = await fs.realpath(file);
      if (!inside(root, realFile)) return { ok: false, reason: '证据文件路径越界' };
      const actual = await digestFile(realFile);
      if (actual.size !== item.size || actual.sha256 !== item.sha256) return { ok: false, reason: '证据完整性校验失败' };
    }
    return { ok: true };
  } catch { return { ok: false, reason: '证据内容不可用' }; }
}

export function resolveEvidence(project, evidenceId) {
  return (project.evidenceBundles || []).find((bundle) => bundle.id === evidenceId && bundle.state === 'ready' && bundle.integrity === 'verified') || null;
}

export async function ensureEvidenceIntegrity(project) {
  let changed = false;
  for (const bundle of project?.evidenceBundles || []) {
    if (bundle.state !== 'ready') continue;
    const result = await verifyEvidence(bundle);
    if (!result.ok) {
      failIntegrity(bundle, result.reason);
      changed = true;
    } else if (bundle.integrity !== 'verified') {
      bundle.integrity = 'verified';
      bundle.verifiedAt ||= now();
      bundle.updatedAt = now();
      changed = true;
    }
  }
  if (changed) recalculateArtifactUsage(project);
  return changed;
}

export async function recoverEvidenceFinalization(projects) {
  for (const project of projects || []) {
    project.evidenceBundles ||= [];
    let root;
    try { root = path.join(await controlledArtifactRoot(project), 'evidence'); } catch { continue; }
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    const ready = new Set((project.evidenceBundles || []).filter((bundle) => bundle.state === 'ready').map((bundle) => bundle.id));
    const integrityFailed = new Set((project.evidenceBundles || []).filter((bundle) => bundle.state === 'integrity-failed').map((bundle) => bundle.id));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'quarantine' || ready.has(entry.name) || integrityFailed.has(entry.name)) continue;
      const candidateRoot = path.join(root, entry.name);
      if (entry.name.endsWith('.tmp')) {
        await fs.rm(candidateRoot, { recursive: true, force: true });
        continue;
      }
      let manifest;
      try {
        manifest = JSON.parse(await fs.readFile(path.join(candidateRoot, 'manifest.json'), 'utf8'));
        const recoveredAt = now();
        const recovered = {
          ...manifest,
          root: candidateRoot,
          revision: Number.isInteger(manifest.revision) && manifest.revision > 0 ? manifest.revision : 1,
          integrity: 'verified',
          provenance: structuredClone(manifest.provenance || {}),
          commit: manifest.commit ?? manifest.provenance?.commit ?? null,
          verifiedAt: manifest.verifiedAt || recoveredAt,
          manifestHash: manifestDigest(manifest),
          manifestSha256: manifestDigest(manifest),
          createdAt: manifest.createdAt || recoveredAt,
          updatedAt: recoveredAt,
        };
        const expectedDirectory = entry.name.includes('.finalizing-') ? entry.name.slice(0, entry.name.indexOf('.finalizing-')) : entry.name;
        const run = (project.testruns || []).find((item) => item.id === manifest.testRunId && item.projectId === project.id);
        if (manifest.id !== expectedDirectory || manifest.projectId !== project.id || !run || !TERMINAL.has(run.status) || !provenanceMatches(manifest.provenance || {}, run.provenance || {}) || (manifest.commit ?? manifest.provenance?.commit ?? null) !== (run.provenance?.commit ?? null) || !(await verifyEvidence(recovered)).ok) throw new Error('invalid manifest');
        if (entry.name.includes('.finalizing-')) {
          const finalRoot = path.join(root, manifest.id);
          if (await fs.stat(finalRoot).catch(() => null)) throw new Error('final evidence already exists');
          await fs.rename(candidateRoot, finalRoot);
          recovered.root = finalRoot;
        }
        project.evidenceBundles.push(recovered);
        if (!run.evidenceRefs?.includes(recovered.id)) run.evidenceRefs = [...(run.evidenceRefs || []), recovered.id];
      } catch (error) {
        const quarantine = path.join(root, 'quarantine');
        await fs.mkdir(quarantine, { recursive: true });
        let quarantinedRoot = path.join(quarantine, entry.name);
        if (await fs.stat(quarantinedRoot).catch(() => null)) quarantinedRoot = path.join(quarantine, `${entry.name}-${Date.now()}`);
        await fs.rename(candidateRoot, quarantinedRoot).catch(() => fs.rm(candidateRoot, { recursive: true, force: true }));
        if (manifest?.id && manifest.projectId === project.id && !project.evidenceBundles.some((bundle) => bundle.id === manifest.id)) {
          project.evidenceBundles.push({ ...manifest, root: quarantinedRoot, state: 'integrity-failed', integrity: 'failed', integrityError: error.message || '证据恢复失败', revision: Number.isInteger(manifest.revision) && manifest.revision > 0 ? manifest.revision + 1 : 2, updatedAt: now() });
        }
      }
    }
    project.evidenceBundles = (project.evidenceBundles || []).filter((bundle) => bundle.state === 'ready' || bundle.state === 'integrity-failed');
    recalculateArtifactUsage(project);
  }
  return projects;
}
