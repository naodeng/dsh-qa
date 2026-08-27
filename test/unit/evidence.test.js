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
