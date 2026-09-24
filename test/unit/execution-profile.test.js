import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from '../helpers/quality-fixtures.js';
import * as executionProfiles from '../../server/quality/execution-profile.js';

const { createExecutionProfile, createExecutionProfileVersion, resolveExecutionCommand } = executionProfiles;

test('validates execution profiles and keeps immutable versions', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'));
  fs.mkdirSync(path.join(workspacePath, 'test/unit'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'test/unit/store.test.js'), '');
  const project = makeProject({ workspacePath });
  assert.throws(() => createExecutionProfile(project, { executor: 'shell', cwdRelative: '.' }), /executor/);
  assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '../outside' }), /工作区/);
  assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/*.test.js'] }), /精确文件/);
  assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/missing.test.js'] }), /不存在/);
  const v1 = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/store.test.js'], networkIntent: 'none' });
  const v2 = createExecutionProfileVersion(project, v1.id, { timeoutMs: 120000 });
  assert.equal(v2.version, 2);
  assert.equal(v1.version, 1);
  assert.equal(typeof executionProfiles.currentExecutionProfileVersion, 'function');
  assert.deepEqual(executionProfiles.currentExecutionProfileVersion(v1), v2);
  assert.deepEqual(resolveExecutionCommand(project, v2, []), [process.execPath, '--test', 'test/unit/store.test.js']);
});

test('uses the current immutable profile version for execution settings', () => {
  const workspacePath = process.cwd();
  const project = makeProject({ workspacePath });
  const profile = createExecutionProfile(project, {
    name: 'v1', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/fail.fixture.mjs'], networkIntent: 'none', timeoutMs: 10_000,
  });

  createExecutionProfileVersion(project, profile.id, {
    name: 'v2', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], timeoutMs: 20_000,
  });

  assert.equal(typeof executionProfiles.currentExecutionProfileVersion, 'function');
  const current = executionProfiles.currentExecutionProfileVersion(profile);
  assert.equal(current.version, 2);
  assert.equal(current.name, 'v2');
  assert.equal(current.timeoutMs, 20_000);
  assert.deepEqual(current.targetFiles, ['test/fixtures/runner/pass.fixture.mjs']);
});

test('bases each new profile version on the current version', () => {
  const workspacePath = process.cwd();
  const project = makeProject({ workspacePath });
  const profile = createExecutionProfile(project, {
    name: 'v1', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/fail.fixture.mjs'], networkIntent: 'none', timeoutMs: 10_000,
  });
  createExecutionProfileVersion(project, profile.id, { name: 'v2', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'] });

  createExecutionProfileVersion(project, profile.id, { timeoutMs: 30_000 });

  const current = executionProfiles.currentExecutionProfileVersion(profile);
  assert.equal(current.version, 3);
  assert.equal(current.name, 'v2');
  assert.equal(current.timeoutMs, 30_000);
  assert.deepEqual(current.targetFiles, ['test/fixtures/runner/pass.fixture.mjs']);
});

test('normalizes project-level host profiles while keeping legacy local profiles executable', () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const host = createExecutionProfile(project, {
    name: 'browser host',
    kind: 'host',
    provider: 'browser-use',
    capabilities: ['navigate'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    timeoutMs: 30_000,
  });

  const currentHost = executionProfiles.currentExecutionProfileVersion(host);
  assert.equal(host.kind, 'host');
  assert.equal(currentHost.kind, 'host');
  assert.equal(currentHost.provider, 'browser-use');
  assert.deepEqual(currentHost.targetPolicy, { origins: ['https://example.test'], mcpTargets: [] });

  const local = createExecutionProfile(project, {
    name: 'local', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none',
  });
  assert.equal(executionProfiles.currentExecutionProfileVersion(local).executor, 'node-test');
  assert.deepEqual(resolveExecutionCommand(project, executionProfiles.currentExecutionProfileVersion(local)), [process.execPath, '--test', 'test/fixtures/runner/pass.fixture.mjs']);
});
