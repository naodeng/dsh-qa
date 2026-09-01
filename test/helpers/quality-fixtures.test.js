import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeQualityTask, makeTestRun } from './quality-fixtures.js';

test('quality fixtures return isolated project-owned entities', () => {
  const first = makeProject();
  const second = makeProject();
  first.qualityTasks.push(makeQualityTask({ projectId: first.id }));
  first.testruns.push(makeTestRun({ projectId: first.id }));
  assert.equal(first.qualityTasks.length, 1);
  assert.equal(first.testruns.length, 1);
  assert.equal(second.qualityTasks.length, 0);
  assert.equal(second.testruns.length, 0);
});
