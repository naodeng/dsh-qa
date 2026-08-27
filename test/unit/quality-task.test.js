import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../helpers/quality-fixtures.js';
import { createQualityTask, getQualityTask, listQualityTasks, normalizeQualityProject, recomputeStage } from '../../server/quality/task.js';

test('normalizes legacy projects and creates an intake quality task', () => {
  const legacy = makeProject();
  delete legacy.qualityTasks;
  assert.deepEqual(normalizeQualityProject(legacy).qualityTasks, []);
  const task = createQualityTask(legacy, { title: '支付回调风险' });
  assert.match(task.id, /^qt_/);
  assert.equal(task.title, '支付回调风险');
  assert.deepEqual(task.acceptanceCriteria, []);
  assert.equal(getQualityTask(legacy, task.id), task);
  assert.deepEqual(listQualityTasks(legacy), [task]);
});

test('recomputes confirmation stage only for confirmed open high risks', () => {
  const task = { risks: [{ severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'open' }] };
  assert.equal(recomputeStage(task), 'confirmation');
  task.risks[0].dispositionStatus = 'accepted';
  assert.equal(recomputeStage(task), 'intake');
});
