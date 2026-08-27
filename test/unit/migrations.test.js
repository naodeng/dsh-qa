import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, migrateDb } from '../../server/migrations.js';

test('migration initializes quality collections and preserves unknown fields', () => {
  const legacy = { projects: [{ id: 'p1', customField: { keep: true } }], feed: [], extra: 'keep' };
  const migrated = migrateDb(legacy);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.projects[0].qualityTasks, []);
  assert.deepEqual(migrated.projects[0].qualityAudit, []);
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
