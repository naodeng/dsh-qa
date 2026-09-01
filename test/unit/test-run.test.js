import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../helpers/quality-fixtures.js';
import { createTestRun, normalizeTestRunProject } from '../../server/quality/test-run.js';

test('normalizes legacy projects and stores imported summaries as unknown', () => {
  const legacy = makeProject();
  delete legacy.testruns;
  assert.deepEqual(normalizeTestRunProject(legacy).testruns, []);
  const run = createTestRun(legacy, { mode: 'imported', executor: 'playwright', summary: '2 passed' });
  assert.equal(run.mode, 'imported');
  assert.equal(run.status, 'unknown');
  assert.equal(run.resultTrust, 'imported-summary');
  assert.equal(legacy.testruns[0].id, run.id);
  assert.equal(legacy.materials[0].type, 'run');
});
