import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from '../helpers/quality-fixtures.js';
import { enqueueArtifactCleanup, runArtifactCleanup, executeArtifactCleanup, startArtifactCleanupWorker } from '../../server/quality/evidence-retention.js';
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-retention-'));

test('retention enqueues controlled cleanup and preserves referenced evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-retention-'));
  const project = makeProject({ artifactRoot: root, evidenceBundles: [{ id: 'ev-kept', state: 'ready', root: path.join(root, 'ev-kept'), referenced: true }, { id: 'ev-old', state: 'ready', root: path.join(root, 'ev-old'), createdAt: '2020-01-01T00:00:00.000Z' }] });
  fs.mkdirSync(project.evidenceBundles[0].root); fs.mkdirSync(project.evidenceBundles[1].root);
  const job = enqueueArtifactCleanup(project, { before: '2021-01-01T00:00:00.000Z' });
  assert.equal(job.status, 'queued');
  const result = await runArtifactCleanup(project, job.id);
  assert.deepEqual(result.deleted, ['ev-old']);
  assert.equal(fs.existsSync(project.evidenceBundles[0].root), true);
  assert.equal(fs.existsSync(project.evidenceBundles[1].root), false);
  assert.equal(job.status, 'completed');
});

test('retention defaults to a 30-day cutoff when omitted', () => {
  const project = makeProject();
  const before = Date.parse(enqueueArtifactCleanup(project).before);
  assert.ok(Math.abs(Date.now() - before - 30 * 24 * 60 * 60 * 1000) < 5000);
});

test('cleanup failure is retryable and records attempt details', async () => {
  const project = makeProject();
  const job = enqueueArtifactCleanup(project);
  const result = await executeArtifactCleanup(job, { rm: async () => { throw new Error('busy'); } });
  assert.equal(result.status, 'retryable');
  assert.equal(result.attempts, 1);
  assert.equal(result.lastError, 'busy');
});

test('cleanup worker processes pending jobs immediately and can stop', async () => {
  const root = tempDir();
  const jobs = [{ id: 'job-1', artifactRoot: root, status: 'queued', attempts: 0 }];
  const worker = startArtifactCleanupWorker({ jobs, intervalMs: 60_000, batchSize: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(jobs[0].status, 'completed');
  worker.stop();
});
