import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGate, makeProject } from '../helpers/quality-fixtures.js';
import { buildGateTrend } from '../../server/quality/gate-trend.js';

test('builds a stable computed-gate trend without approval gates', () => {
  const project = makeProject({ gates: [
    makeGate({ id: 'gate_b', qualityTaskId: 'task_1', kind: 'computed', verdict: 'BLOCK', calculatedAt: '2026-08-25T10:00:00Z' }),
    makeGate({ id: 'approval_1', qualityTaskId: 'task_1', kind: 'approval', status: 'approved', calculatedAt: '2026-08-25T09:00:00Z' }),
    makeGate({ id: 'gate_a', qualityTaskId: 'task_1', kind: 'computed', verdict: 'WARN', calculatedAt: '2026-08-25T10:00:00Z' }),
  ] });
  const trend = buildGateTrend(project, 'task_1');
  assert.deepEqual(trend.series.map((item) => item.id), ['gate_a', 'gate_b']);
  assert.deepEqual(trend.counts, { PASS: 0, WARN: 1, BLOCK: 1 });
  assert.equal(trend.consecutiveBlock, 1);
});
