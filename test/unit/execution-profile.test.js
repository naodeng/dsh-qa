import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from '../helpers/quality-fixtures.js';
import { createExecutionProfile, createExecutionProfileVersion, resolveExecutionCommand } from '../../server/quality/execution-profile.js';

test('validates execution profiles and keeps immutable versions', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'));
  const project = makeProject({ workspacePath });
  assert.throws(() => createExecutionProfile(project, { executor: 'shell', cwdRelative: '.' }), /executor/);
  assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '../outside' }), /工作区/);
  assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/*.test.js'] }), /精确文件/);
  const v1 = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/store.test.js'], networkIntent: 'none' });
  const v2 = createExecutionProfileVersion(project, v1.id, { timeoutMs: 120000 });
  assert.equal(v2.version, 2);
  assert.equal(v1.version, 1);
  assert.deepEqual(resolveExecutionCommand(project, v2, []), [process.execPath, '--test', 'test/unit/store.test.js']);
});
