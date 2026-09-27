import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, migrateDb } from '../../server/migrations.js';

test('migration initializes quality collections and preserves unknown fields', () => {
  const legacy = { projects: [{ id: 'p1', customField: { keep: true } }], feed: [], extra: 'keep' };
  const migrated = migrateDb(legacy);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.projects[0].qualityTasks, []);
  assert.deepEqual(migrated.projects[0].qualityAudit, []);
  assert.deepEqual(migrated.projects[0].qualityInsightDecisions, []);
  assert.deepEqual(migrated.projects[0].customField, { keep: true });
  assert.equal(migrated.extra, 'keep');
  assert.equal('schemaVersion' in legacy, false);
});

test('migration is idempotent and rejects malformed roots', () => {
  const migrated = migrateDb({ projects: [], feed: [] });
  assert.deepEqual(migrateDb(migrated), migrated);
  assert.throws(() => migrateDb(null), /根节点/);
  assert.throws(() => migrateDb([]), /根节点/);
});

test('migration normalizes existing approval gates without inventing computed results', () => {
  const migrated = migrateDb({ schemaVersion: 2, projects: [{ id: 'project_gate', gates: [{ id: 'gate_legacy', status: 'pending', requestedAt: '2026-08-25T10:00:00.000Z' }] }], feed: [], artifactCleanupJobs: [] });
  const gate = migrated.projects[0].gates[0];
  assert.equal(gate.kind, 'approval');
  assert.equal('verdict' in gate, false);
  assert.equal('checks' in gate, false);
  assert.equal(migrateDb(migrated).projects[0].gates[0].kind, 'approval');
});

test('v3 to v5 migration initializes project hostExecutions and insight decisions without changing local collections', () => {
  const migrated = migrateDb({
    schemaVersion: 3,
    projects: [{ id: 'project_host_migration', executionProfiles: [{ id: 'local_profile' }], testruns: [] }],
    feed: [],
    artifactCleanupJobs: [],
  });

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.projects[0].hostExecutions, []);
  assert.deepEqual(migrated.projects[0].qualityInsightDecisions, []);
  assert.deepEqual(migrated.projects[0].executionProfiles, [{ id: 'local_profile' }]);
  assert.deepEqual(migrated.projects[0].testruns, []);
  assert.deepEqual(migrateDb(migrated), migrated);
});

test('v4 to v5 migration preserves quality entities and unknown fields', () => {
  const migrated = migrateDb({
    schemaVersion: 4,
    projects: [{
      id: 'project_insights_migration',
      qualityTasks: [{ id: 'task_keep' }],
      qualityAudit: [{ id: 'audit_keep' }],
      gates: [{ id: 'gate_keep', kind: 'approval', status: 'pending' }],
      customField: { keep: true },
    }],
    feed: [],
    artifactCleanupJobs: [],
  });

  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.projects[0].qualityInsightDecisions, []);
  assert.deepEqual(migrated.projects[0].qualityTasks, [{ id: 'task_keep' }]);
  assert.deepEqual(migrated.projects[0].qualityAudit, [{ id: 'audit_keep' }]);
  assert.deepEqual(migrated.projects[0].customField, { keep: true });
  assert.deepEqual(migrateDb(migrated), migrated);
});
