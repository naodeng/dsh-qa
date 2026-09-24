import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGate, makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { ActionQueueSourceError, buildActionQueue, readActionQueue, toLegacyReminders } from '../../server/action-queue.js';

const NOW = new Date('2026-09-23T00:00:00.000Z');
const fixtureProjects = [
  makeProject({
    id: 'project_1',
    title: 'Pay',
    testruns: [makeTestRun({ id: 'run_1', projectId: 'project_1', status: 'failed', errorCode: 'provider_error' })],
    gates: [makeGate({ id: 'gate_1', projectId: 'project_1', verdict: 'BLOCK', status: 'evaluated' })],
  }),
  makeProject({
    id: 'project_2',
    title: 'Orders',
    milestones: [{ id: 'milestone_1', title: 'UAT', dueDate: '2026-09-24', status: 'open' }],
  }),
];

test('orders blocking execution actions before due reminders and uses stable tie-breakers', () => {
  const result = buildActionQueue(fixtureProjects, { now: NOW, limit: 50 });
  assert.deepEqual(result.items.map((item) => item.id), [
    'gate_block:project_1:gate_1',
    'run_failed:project_1:run_1',
    'milestone_due:project_2:milestone_1',
  ]);
  assert.equal(result.items[0].status, 'blocked');
  assert.equal(result.items[1].reasonCode, 'provider_error');
  assert.deepEqual(Object.keys(result.items[1]).sort(), ['actionRequired', 'dueAt', 'entityId', 'id', 'kind', 'priority', 'projectId', 'projectTitle', 'reasonArgs', 'reasonCode', 'source', 'status', 'target', 'titleKey']);
  assert.deepEqual(result.items[1].target, { view: 'project-detail', tab: 'qualityTasks', entityId: 'run_1' });
  assert.equal(result.generatedAt, NOW.toISOString());
});

test('distinguishes local test failures from environment failures', () => {
  const project = makeProject({
    id: 'project_local_failures',
    testruns: [
      makeTestRun({ id: 'run_test_failed', projectId: 'project_local_failures', status: 'failed' }),
      makeTestRun({ id: 'run_environment_error', projectId: 'project_local_failures', status: 'environment-error' }),
    ],
  });
  const items = buildActionQueue([project], { now: NOW, limit: 50 }).items;
  assert.equal(items.find((item) => item.entityId === 'run_test_failed')?.reasonCode, 'test_failed');
  assert.equal(items.find((item) => item.entityId === 'run_environment_error')?.reasonCode, 'provider_error');
});

test('hides superseded terminal attempts after a retry starts', () => {
  const project = makeProject({
    id: 'project_retry',
    hostExecutions: [
      { id: 'old_host', testRunId: 'old_run', attemptGroupId: 'group_1', status: 'failed', updatedAt: '2026-09-22T00:00:00.000Z' },
      { id: 'new_host', testRunId: 'new_run', attemptGroupId: 'group_1', status: 'running', updatedAt: '2026-09-23T00:00:00.000Z' },
    ],
    testruns: [
      makeTestRun({ id: 'old_run', projectId: 'project_retry', status: 'failed', provenance: { hostExecutionId: 'old_host' } }),
      makeTestRun({ id: 'new_run', projectId: 'project_retry', status: 'running', provenance: { hostExecutionId: 'new_host' } }),
    ],
  });
  const result = buildActionQueue([project], { now: NOW, limit: 50 });
  assert.equal(result.items.some((item) => item.entityId === 'old_run'), false);
  assert.equal(result.items.find((item) => item.entityId === 'new_run')?.status, 'in_progress');
});

test('legacy reminders keep the existing field shape and bounded controlled titles', () => {
  const reminders = toLegacyReminders(buildActionQueue(fixtureProjects, { now: NOW, limit: 50 }).items, { now: NOW });
  const milestone = reminders.find((item) => item.type === 'milestone');
  const gateOrWorkflow = reminders.find((item) => item.type !== 'milestone');
  assert.deepEqual(Object.keys(milestone).sort(), ['date', 'days', 'id', 'projectId', 'projectTitle', 'severity', 'title', 'type']);
  assert.equal(milestone.days, 1);
  assert.equal('days' in gateOrWorkflow, false);
  assert.deepEqual(Object.keys(gateOrWorkflow).sort(), ['date', 'id', 'projectId', 'projectTitle', 'severity', 'title', 'type']);
  assert.equal(gateOrWorkflow.title, '质量门禁');
});

test('readActionQueue exposes typed source failures and does not convert programming errors to empty data', () => {
  assert.throws(() => readActionQueue({}, { listProjects: () => { throw new ActionQueueSourceError(); } }), (error) => error.code === 'ACTION_QUEUE_SOURCE_UNAVAILABLE');
  assert.throws(() => readActionQueue({}, { listProjects: () => { throw new Error('programming failure'); } }), /programming failure/);
});

test('limit bounds and host evidence actions are deterministic', () => {
  assert.throws(() => buildActionQueue([], { now: NOW, limit: 0 }), /limit/);
  const project = makeProject({
    id: 'project_host_action',
    hostExecutions: [{ id: 'host_1', testRunId: 'run_host', attemptGroupId: 'group_host', provider: 'browser-use', status: 'passed', resultDigest: 'a'.repeat(64), updatedAt: '2026-09-23T00:00:00.000Z' }],
    testruns: [makeTestRun({ id: 'run_host', projectId: 'project_host_action', status: 'passed', resultTrust: 'controlled-host', provenance: { hostExecutionId: 'host_1', hostResultDigest: 'a'.repeat(64) }, artifacts: [{ relativePath: 'run.log', type: 'log' }] })],
  });
  const result = buildActionQueue([project], { now: NOW, limit: 50 });
  assert.equal(result.items[0].kind, 'evidence_incomplete');
  assert.equal(result.items[0].priority, 'critical');
});

test('workflow actions open the Action Desk instead of a project detail tab', () => {
  const project = makeProject({ id: 'project_workflow_target', status: 'intake', assistant: { reminders: 'all' } });
  const workflow = buildActionQueue([project], { now: NOW, limit: 50 }).items.find((item) => item.kind === 'workflow');
  assert.deepEqual(workflow?.target, { view: 'assistant', tab: null, entityId: project.id });
});
