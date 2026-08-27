import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { finalizeEvidence, recoverEvidenceFinalization, verifyEvidence } from '../../server/quality/evidence.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-evidence-'));

test('finalizes terminal run into hashed ready evidence and detects tampering', async () => {
  const artifactRoot = tempDir();
  const stagingDir = path.join(artifactRoot, 'run.staging');
  fs.mkdirSync(stagingDir);
  const project = makeProject({ artifactRoot });
  const run = makeTestRun({ projectId: project.id, status: 'passed', artifactDir: stagingDir });
  project.testruns.push(run);
  fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');

  const bundle = await finalizeEvidence(project, run.id);
  assert.equal(bundle.state, 'ready');
  assert.equal(bundle.items.length, 1);
  assert.match(bundle.items[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(bundle.root, 'manifest.json')), true);
  assert.equal(fs.existsSync(stagingDir), false);
  assert.equal(project.artifactUsageBytes, 6);
  assert.equal((await finalizeEvidence(project, run.id)).id, bundle.id);

  fs.appendFileSync(path.join(bundle.root, bundle.items[0].relativePath), 'tampered');
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
  const manifest = { id: 'ev-recover', projectId: 'project-1', testRunId: 'run-1', state: 'ready', items: [{ id: 'item-1', relativePath: 'process.log', size: 6, sha256 }], totalSize: 6 };
  fs.writeFileSync(path.join(evidenceRoot, 'manifest.json'), JSON.stringify(manifest));
  const project = makeProject({ id: 'project-1', artifactRoot, evidenceBundles: [] });
  await recoverEvidenceFinalization([project]);
  assert.equal(project.evidenceBundles[0].id, 'ev-recover');
  assert.equal((await verifyEvidence(project.evidenceBundles[0])).ok, true);
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
