import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeProject } from '../helpers/quality-fixtures.js';
import { enqueueArtifactCleanup, runArtifactCleanup, executeArtifactCleanup, startArtifactCleanupWorker, recoverOrphanStaging } from '../../server/quality/evidence-retention.js';
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-retention-'));

test('retention enqueues controlled cleanup and preserves referenced evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-retention-'));
  const project = makeProject({ artifactRoot: root, evidenceBundles: [{ id: 'ev-kept', state: 'ready', root: path.join(root, 'ev-kept'), totalSize: 4, referenced: true }, { id: 'ev-old', state: 'ready', root: path.join(root, 'ev-old'), totalSize: 6, createdAt: '2020-01-01T00:00:00.000Z' }] });
  fs.mkdirSync(project.evidenceBundles[0].root); fs.mkdirSync(project.evidenceBundles[1].root);
  const job = enqueueArtifactCleanup(project, { before: '2021-01-01T00:00:00.000Z' });
  assert.equal(job.status, 'queued');
  const result = await runArtifactCleanup(project, job.id);
  assert.deepEqual(result.deleted, ['ev-old']);
  assert.equal(fs.existsSync(project.evidenceBundles[0].root), true);
  assert.equal(fs.existsSync(path.join(root, 'ev-old')), false);
  assert.deepEqual(project.evidenceBundles.map((bundle) => bundle.id), ['ev-kept']);
  assert.equal(project.artifactUsageBytes, 4);
  assert.equal(job.status, 'completed');
});

test('retention protects evidence referenced by open defects and the latest computed gate', async () => {
  const root = tempDir();
  const project = makeProject({
    artifactRoot: root,
    evidenceBundles: [
      { id: 'ev-defect', state: 'ready', root: path.join(root, 'ev-defect'), totalSize: 1, createdAt: '2020-01-01T00:00:00.000Z' },
      { id: 'ev-gate', state: 'ready', root: path.join(root, 'ev-gate'), totalSize: 2, createdAt: '2020-01-01T00:00:00.000Z' },
      { id: 'ev-free', state: 'ready', root: path.join(root, 'ev-free'), totalSize: 3, createdAt: '2020-01-01T00:00:00.000Z' },
    ],
    defects: [{ id: 'defect-1', status: 'open', evidenceRefs: ['ev-defect'] }],
    gates: [{ id: 'gate-old', kind: 'computed', checks: [{ evidenceRefs: ['ev-free'] }] }, { id: 'gate-latest', kind: 'computed', checks: [{ evidenceRefs: ['ev-gate'] }] }],
  });
  for (const bundle of project.evidenceBundles) fs.mkdirSync(bundle.root);
  const job = enqueueArtifactCleanup(project, { before: '2021-01-01T00:00:00.000Z' });

  await runArtifactCleanup(project, job.id);

  assert.deepEqual(project.evidenceBundles.map((bundle) => bundle.id), ['ev-defect', 'ev-gate']);
  assert.equal(fs.existsSync(path.join(root, 'ev-free')), false);
});

test('retention removes deleted evidence references and recomputes quota', async () => {
  const root = tempDir();
  const bundleRoot = path.join(root, 'ev-old');
  fs.mkdirSync(bundleRoot);
  const project = makeProject({ artifactRoot: root, artifactUsageBytes: 99, evidenceBundles: [{ id: 'ev-old', state: 'ready', root: bundleRoot, totalSize: 7, createdAt: '2020-01-01T00:00:00.000Z' }], testruns: [{ id: 'run-1', evidenceRefs: ['ev-old', 'ev-kept'] }] });
  const job = enqueueArtifactCleanup(project, { before: '2021-01-01T00:00:00.000Z' });
  await runArtifactCleanup(project, job.id);
  assert.equal(project.artifactUsageBytes, 0);
  assert.deepEqual(project.testruns[0].evidenceRefs, ['ev-kept']);
});

test('retention defaults to a 30-day cutoff when omitted', () => {
  const project = makeProject();
  const before = Date.parse(enqueueArtifactCleanup(project).before);
  assert.ok(Math.abs(Date.now() - before - 30 * 24 * 60 * 60 * 1000) < 5000);
});

test('cleanup failure is retryable and records attempt details', async () => {
  const project = makeProject({ artifactRoot: path.join(tempDir(), 'project-root') });
  const job = enqueueArtifactCleanup(project);
  const result = await executeArtifactCleanup(job, { rm: async () => { throw new Error('busy'); } });
  assert.equal(result.status, 'retryable');
  assert.equal(result.attempts, 1);
  assert.equal(result.lastError, 'busy');
});

test('cleanup rejects a persisted artifact root that is not a project root', async () => {
  let removed = false;
  const result = await executeArtifactCleanup({ projectId: 'project-1', artifactRoot: '/', status: 'queued', attempts: 0 }, { rm: async () => { removed = true; } });

  assert.equal(result.status, 'failed');
  assert.equal(removed, false);
  assert.match(result.lastError, /受控产物目录/);
});

test('cleanup rejects an artifact root symlink before invoking removal', async () => {
  const parent = tempDir();
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'project-root');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, 'dir');
  let removed = false;

  const result = await executeArtifactCleanup({ projectId: 'project-1', artifactRoot: link, status: 'queued', attempts: 0 }, { rm: async () => { removed = true; } });

  assert.equal(result.status, 'failed');
  assert.equal(removed, false);
  assert.match(result.lastError, /受控产物目录/);
});

test('cleanup worker skips live projects, removes successful jobs, persists changes, and can stop', async () => {
  const root = tempDir();
  const jobs = [{ id: 'job-live', projectId: 'live', artifactRoot: tempDir(), status: 'queued', attempts: 0 }, { id: 'job-1', projectId: 'deleted', artifactRoot: root, status: 'queued', attempts: 0 }];
  let persisted = 0;
  const worker = startArtifactCleanupWorker({ jobs, intervalMs: 60_000, batchSize: 2, projectExists: (id) => id === 'live', onChange: () => { persisted += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(jobs.map((job) => job.id), ['job-live']);
  assert.equal(persisted, 1);
  worker.stop();
});

test('recovery removes only orphan staging directories under artifact root', async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'run_orphan.staging'));
  const known = path.join(root, 'run-known.staging');
  fs.mkdirSync(known);
  fs.mkdirSync(path.join(root, 'keep'));
  const project = makeProject({ artifactRoot: root, testruns: [{ id: 'run-known', artifactDir: known, status: 'environment-error' }] });
  await recoverOrphanStaging([project]);
  assert.equal(fs.existsSync(path.join(root, 'run_orphan.staging')), false);
  assert.equal(fs.existsSync(known), true);
  assert.equal(fs.existsSync(path.join(root, 'keep')), true);
});

test('service startup keeps staging for a run interrupted by restart', () => {
  const dataDir = tempDir();
  const moduleUrl = new URL('../../server/index.js', import.meta.url).href;
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    const { startQaBench, closeQaBench } = await import(${JSON.stringify(moduleUrl)});
    const store = await import(${JSON.stringify(new URL('../../server/store.js', import.meta.url).href)});
    store.loadStore();
    const project = store.createProject({ title: 'restart recovery', createWorkspace: false });
    const staging = path.join(project.artifactRoot, 'run-restart.staging');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'process.log'), 'interrupted');
    project.testruns.push({ id: 'run-restart', projectId: project.id, status: 'running', artifactDir: staging });
    store.flush();
    const boot = await startQaBench({ port: 0, openBrowser: false, log: () => {} });
    process.stdout.write(fs.existsSync(staging) ? 'kept' : 'removed');
    await closeQaBench(boot.server);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, QA_DATA_DIR: dataDir }, encoding: 'utf8' });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'kept');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('service startup verifies persisted evidence before serving the project', () => {
  const dataDir = tempDir();
  const moduleUrl = new URL('../../server/index.js', import.meta.url).href;
  const evidenceUrl = new URL('../../server/quality/evidence.js', import.meta.url).href;
  const storeUrl = new URL('../../server/store.js', import.meta.url).href;
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    const { startQaBench, closeQaBench } = await import(${JSON.stringify(moduleUrl)});
    const store = await import(${JSON.stringify(storeUrl)});
    const { finalizeEvidence } = await import(${JSON.stringify(evidenceUrl)});
    store.loadStore();
    const project = store.createProject({ title: 'tampered restart recovery', createWorkspace: false });
    const staging = path.join(project.artifactRoot, 'run-tampered.staging');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'process.log'), 'passed');
    const run = { id: 'run-tampered', projectId: project.id, status: 'passed', resultTrust: 'controlled-local', artifactDir: staging, provenance: {} };
    project.testruns.push(run);
    const bundle = await finalizeEvidence(project, run.id);
    store.flush();
    fs.appendFileSync(path.join(bundle.root, 'process.log'), 'tampered');
    const boot = await startQaBench({ port: 0, openBrowser: false, log: () => {} });
    process.stdout.write(store.getProject(project.id).evidenceBundles[0].state);
    await closeQaBench(boot.server);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, QA_DATA_DIR: dataDir }, encoding: 'utf8' });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'integrity-failed');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
