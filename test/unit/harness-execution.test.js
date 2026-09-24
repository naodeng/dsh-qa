import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeProject } from '../helpers/quality-fixtures.js';
import {
  mapHostExecutionResult,
  startHostExecution,
  validateHostExecutionRequest,
} from '../../server/quality/harness-execution.js';
import { normalizeHostExecutionProfile } from '../../server/quality/execution-profile.js';

const artifactRoot = path.join(os.tmpdir(), 'dsh-host-artifacts');

function hostVersion(overrides = {}) {
  return {
    version: 2,
    kind: 'host',
    name: 'browser host',
    provider: 'browser-use',
    capabilities: ['navigate', 'inspect'],
    targetPolicy: { origins: ['https://example.test'], mcpTargets: [] },
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    timeoutMs: 30_000,
    ...overrides,
  };
}

function makeHostProject(overrides = {}) {
  return makeProject({
    id: 'project_host',
    artifactRoot,
    qualityTasks: [{ id: 'qt_1', version: 3, sources: [{ digest: 'source-a' }] }],
    executionProfiles: [{
      id: 'profile_host',
      kind: 'host',
      currentVersion: 2,
      disabled: false,
      versions: [hostVersion()],
    }],
    ...overrides,
  });
}

function validRequest(project = makeHostProject()) {
  return validateHostExecutionRequest(project, 'qt_1', {
    profileId: 'profile_host',
    provider: 'browser-use',
    capability: 'navigate',
    target: 'https://example.test',
    timeoutMs: 30_000,
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    expectedRevision: 3,
  });
}

test('accepts only profile capabilities and returns a normalized request', () => {
  const request = validRequest();

  assert.equal(request.projectId, 'project_host');
  assert.equal(request.qualityTaskId, 'qt_1');
  assert.equal(request.profileId, 'profile_host');
  assert.equal(request.provider, 'browser-use');
  assert.equal(request.capability, 'navigate');
  assert.equal(request.profileVersion, 2);
  assert.equal(request.adapterId, 'browser-use:navigate');
  assert.deepEqual(request.targetMetadata, {
    kind: 'url',
    origin: 'https://example.test',
    url: 'https://example.test/',
  });
  assert.deepEqual(request.provenance, {
    projectId: 'project_host',
    qualityTaskId: 'qt_1',
    profileId: 'profile_host',
    profileVersion: 2,
    provider: 'browser-use',
    capability: 'navigate',
    sourceDigests: ['source-a'],
  });
});

test('rejects unknown fields, stale revisions, disabled profiles, and local profiles', () => {
  const project = makeHostProject();

  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', {
    ...validRequest(project),
    unexpected: true,
  }), /unknown|未知/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', {
    profileId: 'profile_host', provider: 'browser-use', capability: 'navigate',
    target: 'https://example.test', timeoutMs: 30_000, expectedRevision: 2,
  }), /revision|版本|stale/i);
  assert.throws(() => validateHostExecutionRequest(project, 'missing-task', {
    profileId: 'profile_host', provider: 'browser-use', capability: 'navigate',
    target: 'https://example.test', timeoutMs: 30_000, expectedRevision: 3,
  }), /task|质量任务|不存在/i);

  project.executionProfiles[0].disabled = true;
  assert.throws(() => validRequest(project), /disabled|停用|不可用/i);

  const localProject = makeHostProject({
    executionProfiles: [{ id: 'local_profile', executor: 'node-test', version: 1, targetFiles: ['test.js'] }],
  });
  assert.throws(() => validateHostExecutionRequest(localProject, 'qt_1', {
    profileId: 'local_profile', provider: 'browser-use', capability: 'navigate',
    target: 'https://example.test', timeoutMs: 30_000, expectedRevision: 3,
  }), /host|宿主|profile|配置/i);
});

test('rejects unsupported provider/capability, URL, origin, timeout, and artifact policy values', () => {
  const project = makeHostProject();
  const base = {
    profileId: 'profile_host', provider: 'browser-use', capability: 'navigate',
    target: 'https://example.test', timeoutMs: 30_000, expectedRevision: 3,
  };

  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...base, capability: 'tool-call' }), /capability|能力/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...base, target: 'not-a-url' }), /URL|目标|target/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...base, target: 'https://outside.example.test/path' }), /origin|来源|目标/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...base, timeoutMs: 31_000 }), /timeout|超时/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...base, timeoutMs: 500 }), /timeout|超时/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', {
    ...base,
    artifactPolicy: { logs: true, screenshots: true, trace: true, shell: true },
  }), /artifact|产物|unknown|未知/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', {
    ...base,
    provider: 'shell',
  }), /provider|宿主|支持/i);
});

test('accepts only registered MCP server and tool targets', () => {
  const project = makeHostProject({
    executionProfiles: [{
      id: 'mcp_profile',
      kind: 'host',
      currentVersion: 1,
      disabled: false,
      versions: [hostVersion({
        version: 1,
        provider: 'mcp',
        capabilities: ['tool-call'],
        targetPolicy: { origins: [], mcpTargets: [{ serverId: 'server_1', toolNames: ['inspect'] }] },
      })],
    }],
  });
  const input = {
    profileId: 'mcp_profile', provider: 'mcp', capability: 'tool-call',
    target: { serverId: 'server_1', toolName: 'inspect' }, timeoutMs: 30_000, expectedRevision: 3,
  };
  const request = validateHostExecutionRequest(project, 'qt_1', input);
  assert.deepEqual(request.target, { serverId: 'server_1', toolName: 'inspect' });
  assert.deepEqual(request.targetMetadata, { kind: 'mcp-tool', serverId: 'server_1', toolName: 'inspect' });
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...input, target: { serverId: 'server_2', toolName: 'inspect' } }), /MCP|server|登记|注册/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...input, target: { serverId: 'server_1', toolName: 'delete' } }), /MCP|tool|工具|登记|注册/i);
  assert.throws(() => validateHostExecutionRequest(project, 'qt_1', { ...input, target: { serverId: 'server_1', toolName: 'inspect', command: 'rm -rf' } }), /unknown|未知|target|目标/i);
});

test('normalizes a host profile without changing the legacy local profile contract', async () => {
  const project = makeProject({ workspacePath: process.cwd() });
  const profile = normalizeHostExecutionProfile(project, {
    name: 'browser host',
    kind: 'host',
    provider: 'computer-use',
    capabilities: ['interact'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: false, trace: true },
    timeoutMs: 20_000,
  });

  assert.equal(profile.kind, 'host');
  assert.equal(profile.provider, 'computer-use');
  assert.deepEqual(profile.capabilities, ['interact']);
  assert.deepEqual(profile.targetPolicy, { origins: ['https://example.test'], mcpTargets: [] });

  const local = await import('../../server/quality/execution-profile.js');
  const localProfile = local.createExecutionProfile(project, {
    name: 'local', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/fixtures/runner/pass.fixture.mjs'], networkIntent: 'none',
  });
  assert.equal(local.currentExecutionProfileVersion(localProfile).executor, 'node-test');
  assert.deepEqual(local.resolveExecutionCommand(project, local.currentExecutionProfileVersion(localProfile)), [process.execPath, '--test', 'test/fixtures/runner/pass.fixture.mjs']);
});

test('starts only through an explicit adapter and preserves the normalized request boundary', async () => {
  const project = makeHostProject();
  const request = validRequest(project);
  const received = [];
  const execution = await startHostExecution(project, request, {
    id: 'fake-browser-use',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async (normalizedRequest) => {
      received.push(normalizedRequest);
      return { status: 'queued', providerExecutionId: 'provider_1' };
    },
  });

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], request);
  assert.equal(execution.status, 'queued');
  assert.equal(execution.providerExecutionId, 'provider_1');
  assert.equal(execution.adapterId, 'fake-browser-use');
  assert.equal(execution.attemptGroupId.startsWith('attempt_'), true);
  assert.equal('command' in execution, false);

  const unavailable = await startHostExecution(project, request);
  assert.equal(unavailable.status, 'not_run');
  assert.equal(unavailable.errorCode, 'provider_unavailable');
});

test('turns an explicit adapter null or undefined result into a provider error', async () => {
  const project = makeHostProject();
  const request = validRequest(project);

  for (const emptyResult of [undefined, null]) {
    const execution = await startHostExecution(project, request, {
      id: 'fake-empty-result',
      provider: 'browser-use',
      capabilities: ['navigate'],
      start: async () => emptyResult,
    });

    assert.equal(execution.status, 'provider_error');
    assert.equal(execution.errorCode, 'provider_error');
    assert.match(execution.errorSummary, /adapter|result|结果/i);
  }
});

test('maps host results to controlled-host TestRun patches without creating verdicts', () => {
  const project = makeHostProject();
  const hostExecution = {
    id: 'host_1',
    projectId: project.id,
    qualityTaskId: 'qt_1',
    profileId: 'profile_host',
    profileVersion: 2,
    provider: 'browser-use',
    capability: 'navigate',
    adapterId: 'browser-use:navigate',
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    stagingRoot: path.join(project.artifactRoot, 'host_1.staging'),
  };
  const patch = mapHostExecutionResult(project, hostExecution, {
    status: 'passed',
    artifacts: [{ relativePath: 'trace.zip', type: 'trace' }],
  });

  assert.equal(patch.mode, 'local');
  assert.equal(patch.status, 'passed');
  assert.equal(patch.resultTrust, 'controlled-host');
  assert.equal(patch.provenance.hostExecutionId, 'host_1');
  assert.equal(patch.provenance.provider, 'browser-use');
  assert.equal(patch.provenance.profileVersion, 2);
  assert.equal('verdict' in patch, false);
});

test('maps frozen host statuses to existing TestRun names and rejects uncontrolled artifacts', () => {
  const project = makeHostProject();
  const hostExecution = {
    id: 'host_2', provider: 'browser-use', capability: 'navigate', profileVersion: 2,
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    stagingRoot: path.join(project.artifactRoot, 'host_2.staging'),
  };
  const mappings = {
    failed: 'failed',
    cancelled: 'cancelled',
    timed_out: 'timed-out',
    provider_error: 'environment-error',
    blocked: 'environment-error',
    not_run: 'environment-error',
  };
  for (const [hostStatus, runStatus] of Object.entries(mappings)) {
    const patch = mapHostExecutionResult(project, hostExecution, { status: hostStatus, artifacts: [] });
    assert.equal(patch.status, runStatus);
    assert.equal(patch.resultTrust, 'controlled-host');
    if (hostStatus === 'provider_error') assert.equal(patch.errorCode, 'provider_error');
    if (hostStatus === 'blocked' || hostStatus === 'not_run') assert.equal(patch.errorCode, 'provider_unavailable');
  }

  assert.throws(() => mapHostExecutionResult(project, hostExecution, {
    status: 'passed', artifacts: [{ relativePath: '../escape.log', type: 'log' }],
  }), /artifact|产物|path|路径/i);
  assert.throws(() => mapHostExecutionResult(project, hostExecution, {
    status: 'passed', artifacts: [{ relativePath: '/tmp/escape.log', type: 'log' }],
  }), /artifact|产物|path|路径/i);
  assert.throws(() => mapHostExecutionResult(project, { ...hostExecution, artifactPolicy: { logs: false, screenshots: true, trace: true } }, {
    status: 'passed', artifacts: [{ relativePath: 'run.log', type: 'log' }],
  }), /artifact|产物|policy|策略/i);
});

test('requires normalized artifact policy and rejects staging or descriptor symlink escapes', (t) => {
  const artifactRootForTest = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-artifact-root-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-artifact-outside-'));
  t.after(() => {
    fs.rmSync(artifactRootForTest, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });

  const project = makeHostProject({ artifactRoot: artifactRootForTest });
  const stagingRoot = path.join(artifactRootForTest, 'host_3.staging');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const hostExecution = {
    id: 'host_3',
    provider: 'browser-use',
    capability: 'navigate',
    profileVersion: 2,
    stagingRoot,
    artifactPolicy: { logs: true, screenshots: true, trace: true },
  };
  const logResult = { status: 'passed', artifacts: [{ relativePath: 'run.log', type: 'log' }] };

  assert.throws(() => mapHostExecutionResult(project, { ...hostExecution, artifactPolicy: { logs: true } }, logResult), /artifact|policy|策略/i);
  assert.throws(() => mapHostExecutionResult(project, { ...hostExecution, artifactPolicy: undefined }, logResult), /artifact|policy|策略/i);

  fs.symlinkSync(outsideRoot, path.join(stagingRoot, 'linked'), 'dir');
  assert.throws(() => mapHostExecutionResult(project, hostExecution, {
    status: 'passed',
    artifacts: [{ relativePath: 'linked/escape.log', type: 'log' }],
  }), /artifact|path|symlink|路径|受控/i);

  const stagingLink = path.join(artifactRootForTest, 'host-link.staging');
  fs.symlinkSync(outsideRoot, stagingLink, 'dir');
  assert.throws(() => mapHostExecutionResult(project, { ...hostExecution, stagingRoot: stagingLink }, logResult), /artifact|path|symlink|路径|受控/i);
});
