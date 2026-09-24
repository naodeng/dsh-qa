import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import * as evidence from '../../server/quality/evidence.js';
const { finalizeEvidence, recoverEvidenceFinalization, recoverPendingEvidenceFinalization, verifyEvidence } = evidence;

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-evidence-'));

test('finalizes terminal run into hashed ready evidence and detects tampering', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const provenance = { sourceDigests: ['source-1'], commit: 'abc123', testPlanVersion: 2, regressionSetVersion: 1, profileId: 'profile-1', profileVersion: 1 };
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir, provenance });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');

  const bundle = await finalizeEvidence(project, run.id);
  assert.equal(bundle.state, 'ready');
  assert.equal(bundle.integrity, 'verified');
  assert.deepEqual(bundle.provenance, provenance);
  assert.equal(bundle.commit, 'abc123');
  assert.match(bundle.verifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(bundle.items.length, 1);
  assert.match(bundle.items[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(bundle.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(bundle.root, 'manifest.json')), true);
  assert.equal(fs.existsSync(stagingDir), false);
  assert.equal(project.artifactUsageBytes, 6);
  assert.equal((await finalizeEvidence(project, run.id)).id, bundle.id);

  fs.appendFileSync(path.join(bundle.root, bundle.items[0].relativePath), 'tampered');
  assert.equal((await verifyEvidence(bundle)).ok, false);
});

test('finalizes evidence items in stable order with typed metadata', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'z.log'), 'z');
  fs.writeFileSync(path.join(stagingDir, 'a.png'), 'png');

  const bundle = await finalizeEvidence(project, run.id);

  assert.deepEqual(bundle.items.map((item) => item.relativePath), ['a.png', 'z.log']);
  assert.equal(bundle.items[0].type, 'screenshot');
  assert.equal(bundle.items[0].mimeType, 'image/png');
  assert.match(bundle.items[0].capturedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(bundle.items[1].type, 'log');
  assert.equal(bundle.items[1].mimeType, 'text/plain');
});

test('marks a tampered ready bundle integrity-failed before gate use', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');
  const bundle = await finalizeEvidence(project, run.id);
  fs.appendFileSync(path.join(bundle.root, 'process.log'), 'tampered');

  assert.equal(typeof evidence.ensureEvidenceIntegrity, 'function');
  const changed = await evidence.ensureEvidenceIntegrity(project);

  assert.equal(changed, true);
  assert.equal(bundle.state, 'integrity-failed');
  assert.equal(bundle.integrity, 'failed');
  assert.match(bundle.integrityError, /完整性|manifest/);
});

test('restart recovery does not resurrect a persisted integrity-failed bundle', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');
  const bundle = await finalizeEvidence(project, run.id);
  fs.appendFileSync(path.join(bundle.root, 'process.log'), 'tampered');
  await evidence.ensureEvidenceIntegrity(project);

  await recoverEvidenceFinalization([project]);

  assert.equal(project.evidenceBundles.length, 1);
  assert.equal(project.evidenceBundles[0].state, 'integrity-failed');
  assert.equal(fs.existsSync(bundle.root), true);
});

test('startup recovery retries a pending Host evidence finalization', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run-pending.staging');
  fs.mkdirSync(stagingDir);
  const content = 'passed';
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({
    projectId: project.id,
    status: 'passed',
    resultTrust: 'controlled-host',
    artifactDir: stagingDir,
    provenance: { hostExecutionId: 'host_pending', hostResultDigest: 'a'.repeat(64) },
    artifacts: [{
      relativePath: 'run.log',
      type: 'log',
      size: Buffer.byteLength(content),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    }],
    evidenceFinalization: { state: 'pending', errorCode: 'evidence_finalize_pending', attempts: 1 },
  });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'run.log'), content);

  const changed = await recoverPendingEvidenceFinalization([project]);

  assert.equal(changed, true);
  assert.equal(run.evidenceFinalization, undefined);
  assert.equal(project.evidenceBundles[0]?.state, 'ready');
  assert.equal(project.evidenceBundles[0]?.integrity, 'verified');
  assert.deepEqual(run.evidenceRefs, [project.evidenceBundles[0].id]);
});

test('integrity verification rejects symlinked bundle paths after finalize', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.mkdirSync(path.join(stagingDir, 'nested'));
  fs.writeFileSync(path.join(stagingDir, 'nested', 'process.log'), 'passed');
  const outside = path.join(tempDir(), 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'process.log'), 'tampered');
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  const bundle = await finalizeEvidence(project, run.id);
  fs.rmSync(path.join(bundle.root, 'nested'), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(bundle.root, 'nested'), 'dir');

  assert.equal((await verifyEvidence(bundle)).ok, false);
});

test('rejects non-terminal runs and artifacts outside controlled root', async () => {
  const root = tempDir();
  const project = makeProject({ artifactRoot: root });
  const queued = makeTestRun({ projectId: project.id, status: 'queued', artifactDir: path.join(root, 'queued') });
  project.testruns.push(queued);
  await assert.rejects(() => finalizeEvidence(project, queued.id), /终态/);

  const passed = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: tempDir() });
  project.testruns.push(passed);
  await assert.rejects(() => finalizeEvidence(project, passed.id), /受控产物目录/);
});

test('rejects a symlinked configured artifact root', async () => {
  const realRoot = tempDir();
  const parent = tempDir();
  const linkedRoot = path.join(parent, 'artifacts');
  fs.symlinkSync(realRoot, linkedRoot, 'dir');
  const stagingDir = path.join(linkedRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot: linkedRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');

  await assert.rejects(() => finalizeEvidence(project, run.id), /受控产物目录/);
});

test('concurrent finalization returns one evidence bundle', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');
  const [first, second] = await Promise.all([finalizeEvidence(project, run.id), finalizeEvidence(project, run.id)]);
  assert.equal(first.id, second.id);
  assert.equal(project.evidenceBundles.length, 1);
});

test('recovery removes partial evidence directories without exposing them', async () => {
  const artifactRoot = tempDir();
  fs.mkdirSync(path.join(artifactRoot, 'evidence', 'ev-partial.tmp'), { recursive: true });
  fs.mkdirSync(path.join(artifactRoot, 'evidence', 'ev-orphan'), { recursive: true });
  const project = makeProject({ artifactRoot, evidenceBundles: [{ id: 'ev-partial', state: 'finalizing' }] });
  await recoverEvidenceFinalization([project]);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'evidence', 'ev-partial.tmp')), false);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'evidence', 'ev-orphan')), false);
  assert.equal(project.evidenceBundles.filter((bundle) => bundle.state === 'ready').length, 0);
});

test('recovery publishes a verified final directory after a store-flush crash', async () => {
  const artifactRoot = tempDir();
  const evidenceRoot = path.join(artifactRoot, 'evidence', 'ev-recover');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'process.log'), 'passed');
  const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('passed').digest('hex'));
  const provenance = { sourceDigests: ['source-1'], commit: 'abc123', testPlanVersion: 2, regressionSetVersion: 1, profileId: 'profile-1', profileVersion: 1 };
  const manifest = { id: 'ev-recover', projectId: 'project-1', testRunId: 'run-1', state: 'ready', provenance, commit: 'abc123', items: [{ id: 'item-1', relativePath: 'process.log', size: 6, sha256 }], totalSize: 6 };
  fs.writeFileSync(path.join(evidenceRoot, 'manifest.json'), JSON.stringify(manifest));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [], testruns: [makeTestRun({ id: 'run-1', projectId: 'project-1', status: 'passed', provenance })] });
  await recoverEvidenceFinalization([project]);
  assert.equal(project.evidenceBundles[0].id, 'ev-recover');
  assert.deepEqual(project.evidenceBundles[0].provenance, provenance);
  assert.equal(project.evidenceBundles[0].commit, 'abc123');
  assert.equal((await verifyEvidence(project.evidenceBundles[0])).ok, true);
  assert.equal(project.artifactUsageBytes, 6);
  assert.deepEqual(project.testruns[0].evidenceRefs, ['ev-recover']);
});

test('recovery quarantines a manifest whose provenance differs from its terminal run', async () => {
  const artifactRoot = tempDir();
  const evidenceRoot = path.join(artifactRoot, 'evidence', 'ev-stale-provenance');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'process.log'), 'passed');
  const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('passed').digest('hex'));
  const runProvenance = { sourceDigests: ['source-1'], commit: 'run-commit' };
  fs.writeFileSync(path.join(evidenceRoot, 'manifest.json'), JSON.stringify({
    id: 'ev-stale-provenance', projectId: 'project-1', testRunId: 'run-1', state: 'ready',
    provenance: { sourceDigests: ['source-1'], commit: 'wrong-commit' }, commit: 'wrong-commit',
    items: [{ id: 'item-1', relativePath: 'process.log', size: 6, sha256 }], totalSize: 6,
  }));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [], testruns: [makeTestRun({ id: 'run-1', projectId: 'project-1', status: 'passed', provenance: runProvenance })] });

  await recoverEvidenceFinalization([project]);

  assert.equal(project.evidenceBundles[0].state, 'integrity-failed');
  assert.equal(project.evidenceBundles[0].integrity, 'failed');
  assert.equal(fs.existsSync(path.join(artifactRoot, 'evidence', 'quarantine', 'ev-stale-provenance')), true);
});

test('recovery promotes a valid finalizing bundle and quarantines an invalid one', async () => {
  const artifactRoot = tempDir();
  const evidenceRoot = path.join(artifactRoot, 'evidence');
  const finalizing = path.join(evidenceRoot, 'ev-final.finalizing-1');
  fs.mkdirSync(finalizing, { recursive: true });
  fs.writeFileSync(path.join(finalizing, 'process.log'), 'passed');
  const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('passed').digest('hex'));
  fs.writeFileSync(path.join(finalizing, 'manifest.json'), JSON.stringify({ id: 'ev-final', projectId: 'project-1', testRunId: 'run-final', state: 'ready', items: [{ id: 'item-final', relativePath: 'process.log', size: 6, sha256 }], totalSize: 6 }));
  fs.mkdirSync(path.join(evidenceRoot, 'ev-bad.finalizing-1'));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [], testruns: [makeTestRun({ id: 'run-final', projectId: 'project-1', status: 'failed' })] });
  await recoverEvidenceFinalization([project]);
  assert.equal(project.evidenceBundles[0].id, 'ev-final');
  assert.equal(fs.existsSync(path.join(evidenceRoot, 'ev-final')), true);
  assert.equal(fs.existsSync(path.join(evidenceRoot, 'quarantine', 'ev-bad.finalizing-1')), true);
});

test('recovery quarantines evidence whose test run is missing', async () => {
  const artifactRoot = tempDir();
  const evidenceRoot = path.join(artifactRoot, 'evidence', 'ev-missing-run');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'process.log'), 'passed');
  const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('passed').digest('hex'));
  fs.writeFileSync(path.join(evidenceRoot, 'manifest.json'), JSON.stringify({
    id: 'ev-missing-run',
    projectId: 'project-1',
    testRunId: 'run-missing',
    state: 'ready',
    items: [{ id: 'item-missing', relativePath: 'process.log', size: 6, sha256 }],
    totalSize: 6,
  }));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [] });

  await recoverEvidenceFinalization([project]);

  assert.equal(project.evidenceBundles[0].state, 'integrity-failed');
  assert.equal(project.evidenceBundles[0].integrity, 'failed');
  assert.equal(fs.existsSync(evidenceRoot), false);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'evidence', 'quarantine', 'ev-missing-run')), true);
});

test('recovery quarantines manifests with path traversal items', async () => {
  const artifactRoot = tempDir();
  const evidenceRoot = path.join(artifactRoot, 'evidence', 'ev-traversal');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(artifactRoot, 'outside.log'), 'outside');
  const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('outside').digest('hex'));
  const provenance = { sourceDigests: ['source-1'], commit: 'abc123' };
  fs.writeFileSync(path.join(evidenceRoot, 'manifest.json'), JSON.stringify({
    id: 'ev-traversal', projectId: 'project-1', testRunId: 'run-1', state: 'ready', provenance, commit: 'abc123',
    items: [{ id: 'item-traversal', relativePath: '../outside.log', size: 7, sha256 }], totalSize: 7,
  }));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [], testruns: [makeTestRun({ id: 'run-1', projectId: 'project-1', status: 'passed', provenance })] });

  await recoverEvidenceFinalization([project]);

  assert.equal(project.evidenceBundles[0].state, 'integrity-failed');
  assert.equal(project.evidenceBundles[0].integrity, 'failed');
  assert.equal(fs.existsSync(path.join(artifactRoot, 'evidence', 'quarantine', 'ev-traversal')), true);
});

test('recovery preserves the existing quarantine directory', async () => {
  const artifactRoot = tempDir();
  const quarantined = path.join(artifactRoot, 'evidence', 'quarantine', 'ev-kept');
  fs.mkdirSync(quarantined, { recursive: true });
  fs.writeFileSync(path.join(quarantined, 'reason.txt'), 'keep for inspection');
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [] });

  await recoverEvidenceFinalization([project]);

  assert.equal(fs.existsSync(path.join(quarantined, 'reason.txt')), true);
});

test('rejects symlinks, hard links, and files over the per-file quota', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'original.log'), 'x');
  fs.linkSync(path.join(stagingDir, 'original.log'), path.join(stagingDir, 'hard.log'));
  await assert.rejects(() => finalizeEvidence(project, run.id), /硬链接/);
  fs.unlinkSync(path.join(stagingDir, 'hard.log'));
  fs.symlinkSync(path.join(stagingDir, 'original.log'), path.join(stagingDir, 'link.log'));
  await assert.rejects(() => finalizeEvidence(project, run.id), /符号链接/);
  fs.unlinkSync(path.join(stagingDir, 'link.log'));
  fs.writeFileSync(path.join(stagingDir, 'large.log'), '');
  fs.truncateSync(path.join(stagingDir, 'large.log'), 100 * 1024 * 1024 + 1);
  await assert.rejects(() => finalizeEvidence(project, run.id), /100MiB/);
});

test('rejects evidence when the project quota is exceeded', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot, artifactUsageBytes: 10, artifactQuotaBytes: 10 });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');
  await assert.rejects(() => finalizeEvidence(project, run.id), /5GiB|项目产物配额/);
});

test('project quota accumulates finalized bundles across runs', async () => {
  const artifactRoot = tempDir();
  const project = makeProject({ artifactRoot, artifactQuotaBytes: 10 });
  for (const [id, content] of [['run-1', '123456'], ['run-2', 'abcdef']]) {
    const artifactDir = path.join(artifactRoot, `${id}.staging`);
    fs.mkdirSync(artifactDir);
    fs.writeFileSync(path.join(artifactDir, 'process.log'), content);
    project.testruns.push(makeTestRun({ id, projectId: project.id, status: 'passed', artifactDir }));
  }
  await finalizeEvidence(project, 'run-1');
  await assert.rejects(() => finalizeEvidence(project, 'run-2'), /项目产物配额/);
  assert.equal(project.artifactUsageBytes, 6);
  assert.equal(fs.existsSync(project.testruns[1].artifactDir), true);
});
