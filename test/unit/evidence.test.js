import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { finalizeEvidence, verifyEvidence } from '../../server/quality/evidence.js';

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
