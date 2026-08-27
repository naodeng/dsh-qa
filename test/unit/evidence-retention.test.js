import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from '../helpers/quality-fixtures.js';
import { enqueueArtifactCleanup, runArtifactCleanup } from '../../server/quality/evidence-retention.js';

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
