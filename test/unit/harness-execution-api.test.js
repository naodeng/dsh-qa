import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-host-api-'));
process.env.QA_DATA_DIR = dataDir;

const store = await import('../../server/store.js');
const { createExecutionProfile } = await import('../../server/quality/execution-profile.js');
const { startQaBench, closeQaBench } = await import('../../server/index.js');
const { broadcast: sseBroadcast } = await import('../../server/sse.js');

const hostAdapters = new Map();
let eventSink = null;
const started = await startQaBench({
  port: 0,
  openBrowser: false,
  hostAdapters,
  onBroadcast: (type, payload) => {
    eventSink?.push({ type, payload });
    sseBroadcast(type, payload);
  },
  log: () => {},
});
const base = `http://127.0.0.1:${started.server.address().port}`;

test.after(async () => {
  await closeQaBench(started.server);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function callRoute(method, pathname, body = {}, adapters = new Map(), events = null) {
  hostAdapters.clear();
  for (const [key, adapter] of adapters) hostAdapters.set(key, adapter);
  eventSink = events;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

function createHostFixture() {
  const project = store.createProject({ title: 'Host execution API fixture' });
  const task = {
    id: 'quality_task_host_api',
    projectId: project.id,
    version: 1,
    sources: [],
    acceptanceCriteria: [],
    risks: [],
    testScope: [],
    decisions: [],
  };
  project.qualityTasks.push(task);
  const profile = createExecutionProfile(project, {
    name: 'browser host',
    kind: 'host',
    provider: 'browser-use',
    capabilities: ['navigate'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    timeoutMs: 30_000,
  });
  const localProfile = createExecutionProfile(project, {
    name: 'local runner',
    executor: 'node-test',
    cwdRelative: '.',
    targetFiles: ['test/fixtures/runner/pass.fixture.mjs'],
    networkIntent: 'none',
  });
  store.touch(project);
  store.flush();
  return { project, task, profile, localProfile };
}

function hostInput(fixture, extra = {}) {
  return {
    profileId: fixture.profile.id,
    provider: 'browser-use',
    capability: 'navigate',
    target: 'https://example.test/checkout?case=1',
    timeoutMs: 10_000,
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    expectedRevision: fixture.task.version,
    ...extra,
  };
}

function deterministicFakeAdapter(provider, capability, result = {}) {
  const artifactNames = provider === 'browser-use'
    ? ['run.log', 'screen.png', 'trace.zip']
    : [`${provider}.log`, `${provider}.png`, `${provider}.zip`];
  return {
    id: `test-only-${provider}-${capability}`,
    provider,
    capabilities: [capability],
    start: async () => ({
      artifacts: [
        { relativePath: artifactNames[0], type: 'log', mimeType: 'text/plain', size: 12, sha256: 'a'.repeat(64) },
        { relativePath: artifactNames[1], type: 'screenshot', mimeType: 'image/png', size: 24, sha256: 'b'.repeat(64) },
        { relativePath: artifactNames[2], type: 'trace', mimeType: 'application/zip', size: 36, sha256: 'c'.repeat(64) },
      ],
      ...result,
    }),
  };
}

function fakeAdapter(result) {
  return new Map([[
    'browser-use:navigate',
    deterministicFakeAdapter('browser-use', 'navigate', result),
  ]]);
}

function fakeAdapters(result = { status: 'passed' }) {
  return new Map([
    ['browser-use:navigate', deterministicFakeAdapter('browser-use', 'navigate', result)],
    ['computer-use:interact', deterministicFakeAdapter('computer-use', 'interact', result)],
    ['mcp:tool-call', deterministicFakeAdapter('mcp', 'tool-call', result)],
  ]);
}

async function waitForHostExecution(project, executionId, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const execution = project.hostExecutions.find((item) => item.id === executionId);
    if (execution && predicate(execution)) return execution;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const execution = project.hostExecutions.find((item) => item.id === executionId);
  throw new Error(`Host execution 未达到预期状态：${execution?.status || 'missing'}`);
}

async function waitForProjectHostExecution(project, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const execution = project.hostExecutions.find(predicate);
    if (execution) return execution;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Host execution 未在服务响应前建立');
}

test('creates host profiles while preserving local profiles and previews without persistence', async () => {
  const fixture = createHostFixture();
  const preview = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions/preview`, hostInput(fixture));

  assert.equal(preview.status, 200);
  assert.equal(preview.payload.ok, true);
  assert.equal(preview.payload.preview.provider, 'browser-use');
  assert.equal(preview.payload.preview.profileVersion, 1);
  assert.equal(preview.payload.preview.target, 'https://example.test/checkout?case=1');
  assert.equal(fixture.project.hostExecutions.length, 0);
  assert.equal(fixture.localProfile.executor, 'node-test');
  assert.equal(fixture.project.executionProfiles.length, 2);
});

test('creates and versions a host profile through the existing project profile routes', async () => {
  const project = store.createProject({ title: 'Host profile route fixture' });
  const created = await callRoute('POST', `/api/projects/${project.id}/execution-profiles`, {
    name: 'computer host',
    kind: 'host',
    provider: 'computer-use',
    capabilities: ['interact'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: true, trace: false },
    timeoutMs: 20_000,
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.profile.kind, 'host');
  assert.equal(created.payload.profile.version, 1);

  const versioned = await callRoute('POST', `/api/projects/${project.id}/execution-profiles/${created.payload.profile.id}/versions`, {
    expectedRevision: 1,
    name: 'computer host v2',
    timeoutMs: 15_000,
  });
  assert.equal(versioned.status, 201);
  assert.equal(versioned.payload.profile.version, 2);
  assert.equal(versioned.payload.profile.provider, 'computer-use');
  assert.equal(versioned.payload.profile.capabilities[0], 'interact');
});

test('keeps host-only profile fields out of local create and version requests', async () => {
  const project = store.createProject({ title: 'Profile field boundary fixture' });
  const localFields = {
    name: 'local runner',
    executor: 'node-test',
    cwdRelative: '.',
    targetFiles: ['test/fixtures/runner/pass.fixture.mjs'],
    networkIntent: 'none',
  };
  const hostOnlyFields = {
    kind: 'host',
    provider: 'browser-use',
    capabilities: ['navigate'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: true, trace: true },
  };

  for (const field of Object.keys(hostOnlyFields)) {
    const response = await callRoute('POST', `/api/projects/${project.id}/execution-profiles`, { ...localFields, [field]: hostOnlyFields[field] });
    assert.equal(response.status, 400, `local create accepted host-only field ${field}`);
  }

  const created = await callRoute('POST', `/api/projects/${project.id}/execution-profiles`, localFields);
  assert.equal(created.status, 201);
  for (const field of Object.keys(hostOnlyFields).filter((field) => field !== 'kind')) {
    const response = await callRoute('POST', `/api/projects/${project.id}/execution-profiles/${created.payload.profile.id}/versions`, {
      expectedRevision: 1,
      [field]: hostOnlyFields[field],
    });
    assert.equal(response.status, 400, `local version accepted host-only field ${field}`);
  }
});

test('runs deterministic computer-use and mcp test fakes through the same controlled boundary', async () => {
  const project = store.createProject({ title: 'Deterministic host adapter fixture' });
  const task = { id: 'quality_task_host_adapters', projectId: project.id, version: 1, sources: [], acceptanceCriteria: [], risks: [], testScope: [], decisions: [] };
  project.qualityTasks.push(task);
  const computerProfile = createExecutionProfile(project, {
    name: 'computer host', kind: 'host', provider: 'computer-use', capabilities: ['interact'],
    targetPolicy: { origins: ['https://example.test'] }, artifactPolicy: { logs: true, screenshots: true, trace: true }, timeoutMs: 30_000,
  });
  const mcpProfile = createExecutionProfile(project, {
    name: 'mcp host', kind: 'host', provider: 'mcp', capabilities: ['tool-call'],
    targetPolicy: { mcpTargets: [{ serverId: 'server_1', toolNames: ['inspect'] }] }, artifactPolicy: { logs: true, screenshots: true, trace: true }, timeoutMs: 30_000,
  });
  store.touch(project);
  store.flush();

  const computer = await callRoute('POST', `/api/projects/${project.id}/quality-tasks/${task.id}/host-executions`, {
    profileId: computerProfile.id, provider: 'computer-use', capability: 'interact', target: 'https://example.test/checkout', expectedRevision: 1,
  }, fakeAdapters(), []);
  const mcp = await callRoute('POST', `/api/projects/${project.id}/quality-tasks/${task.id}/host-executions`, {
    profileId: mcpProfile.id, provider: 'mcp', capability: 'tool-call', target: { serverId: 'server_1', toolName: 'inspect' }, expectedRevision: 1,
  }, fakeAdapters(), []);

  const computerExecution = await waitForHostExecution(project, computer.payload.execution.id, (execution) => execution.status === 'passed');
  const mcpExecution = await waitForHostExecution(project, mcp.payload.execution.id, (execution) => execution.status === 'passed');

  assert.equal(computer.status, 202);
  assert.equal(computerExecution.status, 'passed');
  assert.equal(computerExecution.artifacts[0].relativePath, 'computer-use.log');
  assert.equal(mcp.status, 202);
  assert.equal(mcpExecution.status, 'passed');
  assert.equal(mcpExecution.targetMetadata.kind, 'mcp-tool');
  assert.equal(mcpExecution.artifacts[2].relativePath, 'mcp.zip');
});

test('rejects unsupported provider and stale quality-task revisions with stable API errors', async () => {
  const fixture = createHostFixture();
  const unsupported = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { provider: 'mcp', capability: 'tool-call', target: { serverId: 'unknown', toolName: 'inspect' } }));
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.payload.ok, false);
  assert.equal(unsupported.payload.code, 'HOST_PROVIDER_DENIED');

  const stale = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { expectedRevision: 0 }));
  assert.equal(stale.status, 409);
  assert.equal(stale.payload.code, 'QUALITY_REVISION_CONFLICT');
  assert.equal(fixture.project.hostExecutions.length, 0);
});

test('persists controlled host results and maps every host status to the existing TestRun spelling', async () => {
  const statuses = [
    ['queued', 'queued', undefined],
    ['running', 'running', undefined],
    ['passed', 'passed', undefined],
    ['failed', 'failed', undefined],
    ['cancelled', 'cancelled', undefined],
    ['timed_out', 'timed-out', undefined],
    ['provider_error', 'environment-error', 'provider_error'],
    ['blocked', 'environment-error', 'provider_unavailable'],
    ['not_run', 'environment-error', 'provider_unavailable'],
  ];
  const fixture = createHostFixture();
  const events = [];

  for (const [hostStatus, testRunStatus, errorCode] of statuses) {
    const started = await callRoute(
      'POST',
      `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`,
      hostInput(fixture, { attemptGroupId: `group_${hostStatus}` }),
      fakeAdapter({ status: hostStatus, ...(hostStatus === 'provider_error' ? { errorCode: 'adapter_down' } : {}) }),
      events,
    );
    assert.equal(started.status, 202);
    const execution = await waitForHostExecution(fixture.project, started.payload.execution.id, (item) => item.status === hostStatus);
    const run = fixture.project.testruns.find((item) => item.id === execution.testRunId);
    assert.equal(execution.status, hostStatus);
    assert.equal(run.status, testRunStatus);
    if (errorCode) assert.equal(run.errorCode, errorCode);
  }

  const passed = fixture.project.hostExecutions.find((execution) => execution.status === 'passed');
  assert.equal(passed.attemptGroupId, 'group_passed');
  assert.equal(passed.request.command, undefined);
  assert.equal(passed.artifactDir, undefined);
  assert.equal(passed.stagingRoot, undefined);
  assert.equal(passed.artifacts[0].relativePath, 'run.log');
  assert.equal(path.isAbsolute(passed.artifacts[0].relativePath), false);
  assert.equal(events.filter((event) => event.type === 'quality.host-execution.updated').length, statuses.length * 3);
  assert.equal(events.filter((event) => event.type === 'quality.test-run.updated').length, statuses.length * 3);
  store.flush();
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
  const persistedProject = persisted.projects.find((item) => item.id === fixture.project.id);
  assert.equal(persistedProject.hostExecutions.length, statuses.length);
  assert.equal(persistedProject.hostExecutions.every((item) => !item.command && !item.stagingRoot && !item.artifactDir), true);
  assert.equal(persistedProject.hostExecutions.every((item) => item.artifacts.every((artifact) => !path.isAbsolute(artifact.relativePath))), true);
});

test('gets and cancels a running host execution with expectedRevision', async () => {
  const fixture = createHostFixture();
  const events = [];
  const started = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture), fakeAdapter({ status: 'running' }), events);
  const executionId = started.payload.execution.id;
  const running = await waitForHostExecution(fixture.project, executionId, (execution) => execution.status === 'running' && execution.revision === 3);

  const status = await callRoute('GET', `/api/projects/${fixture.project.id}/host-executions/${executionId}`, {}, new Map(), events);
  assert.equal(status.status, 200);
  assert.equal(status.payload.execution.status, 'running');
  assert.equal(status.payload.testRun.status, 'running');

  const cancelled = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${executionId}/cancel`, { expectedRevision: running.revision }, new Map(), events);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.execution.status, 'cancelled');
  assert.equal(cancelled.payload.execution.revision, 4);
  assert.equal(cancelled.payload.testRun.status, 'cancelled');

  const conflict = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${executionId}/cancel`, { expectedRevision: 1 }, new Map(), events);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.payload.code, 'QUALITY_REVISION_CONFLICT');
});

test('retries a terminal execution with a stable attempt group and supersedes the old record', async () => {
  const fixture = createHostFixture();
  const events = [];
  const first = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { attemptGroupId: 'stable_group' }), fakeAdapter({ status: 'failed' }), events);
  const oldId = first.payload.execution.id;
  const failed = await waitForHostExecution(fixture.project, oldId, (execution) => execution.status === 'failed');
  const retried = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${oldId}/retry`, { expectedRevision: failed.revision, qualityTaskRevision: fixture.task.version }, fakeAdapter({ status: 'running' }), events);
  await waitForHostExecution(fixture.project, retried.payload.execution.id, (execution) => execution.status === 'running' && execution.revision === 3);

  assert.equal(retried.status, 202);
  assert.notEqual(retried.payload.execution.id, oldId);
  assert.equal(retried.payload.execution.attemptGroupId, 'stable_group');
  assert.equal(retried.payload.execution.status, 'running');
  assert.equal(fixture.project.hostExecutions.find((item) => item.id === oldId).supersededBy, retried.payload.execution.id);
  assert.equal(events.filter((event) => event.type === 'quality.host-execution.updated').length, 7);
});

test('returns an initial response while a Host adapter is still running', async () => {
  const fixture = createHostFixture();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const adapter = {
    id: 'test-only-browser-use-navigate-slow-start',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async () => {
      await gate;
      return { status: 'passed' };
    },
  };
  const starting = callRoute(
    'POST',
    `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`,
    hostInput(fixture),
    new Map([['browser-use:navigate', adapter]]),
  );
  try {
    const response = await Promise.race([
      starting,
      new Promise((resolve) => setTimeout(() => resolve(null), 25)),
    ]);
    assert.ok(response, 'the start route must not wait for a long-running Host adapter');
    assert.equal(response.status, 202);
    assert.ok(['queued', 'running'].includes(response.payload.execution.status));
  } finally {
    release();
    await starting;
  }
});

test('retries against the current quality-task revision instead of reusing a stale request revision', async () => {
  const fixture = createHostFixture();
  const first = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture));
  fixture.task.version = 2;
  store.touch(fixture.project);
  store.flush();

  const stale = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${first.payload.execution.id}/retry`, {
    expectedRevision: first.payload.execution.revision,
    qualityTaskRevision: 1,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.payload.code, 'QUALITY_REVISION_CONFLICT');

  const retried = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${first.payload.execution.id}/retry`, {
    expectedRevision: first.payload.execution.revision,
    qualityTaskRevision: 2,
  });
  assert.equal(retried.status, 202);
  assert.equal(retried.payload.execution.request.expectedRevision, 2);
});

test('automatically finalizes matching evidence after a controlled Host pass', async () => {
  const fixture = createHostFixture();
  const adapter = {
    id: 'test-only-browser-use-navigate-evidence',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async (_request, context) => {
      const written = context.writeArtifact('run.log', 'passed');
      return { status: 'passed', artifacts: [{ type: 'log', mimeType: 'text/plain', ...written }] };
    },
  };
  const started = await callRoute(
    'POST',
    `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`,
    hostInput(fixture),
    new Map([['browser-use:navigate', adapter]]),
  );
  assert.equal(started.status, 202);
  for (let attempt = 0; attempt < 50 && !fixture.project.evidenceBundles.length; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  const execution = fixture.project.hostExecutions[0];
  const run = fixture.project.testruns.find((item) => item.id === execution.testRunId);
  const bundle = fixture.project.evidenceBundles.find((item) => item.testRunId === run.id);
  assert.equal(execution.status, 'passed');
  assert.equal(run.status, 'passed');
  assert.equal(bundle?.state, 'ready');
  assert.equal(bundle?.integrity, 'verified');
  assert.deepEqual(run.evidenceRefs, [bundle.id]);
});

test('persists a bounded pending state when Host evidence cannot be finalized', async () => {
  const fixture = createHostFixture();
  const adapter = {
    id: 'test-only-browser-use-navigate-missing-evidence',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async () => ({ status: 'passed', artifacts: [{ relativePath: 'missing.log', type: 'log', size: 7, sha256: 'a'.repeat(64) }] }),
  };
  const started = await callRoute(
    'POST',
    `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`,
    hostInput(fixture),
    new Map([['browser-use:navigate', adapter]]),
  );
  const execution = await waitForHostExecution(fixture.project, started.payload.execution.id, (item) => item.status === 'passed' && fixture.project.testruns.find((run) => run.id === item.testRunId)?.evidenceFinalization?.state === 'pending');
  const run = fixture.project.testruns.find((item) => item.id === execution.testRunId);
  assert.deepEqual(run.evidenceFinalization, { state: 'pending', errorCode: 'evidence_finalize_pending', attempts: 1, updatedAt: run.evidenceFinalization.updatedAt });
});

test('cancels an in-flight adapter and ignores its late result', async () => {
  const fixture = createHostFixture();
  const events = [];
  let release;
  let cancelCalls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const adapter = {
    id: 'test-only-browser-use-navigate-cancellable',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async () => {
      await gate;
      return { status: 'passed' };
    },
    cancel: () => { cancelCalls += 1; },
  };
  const adapterMap = new Map([['browser-use:navigate', adapter]]);
  const starting = callRoute(
    'POST',
    `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`,
    hostInput(fixture),
    adapterMap,
    events,
  );
  const inFlight = await waitForProjectHostExecution(fixture.project, (execution) => execution.status === 'running');
  assert.equal(inFlight.status, 'running');
  const cancelled = await callRoute(
    'POST',
    `/api/projects/${fixture.project.id}/host-executions/${inFlight.id}/cancel`,
    { expectedRevision: inFlight.revision },
    adapterMap,
    events,
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.execution.status, 'cancelled');
  assert.equal(cancelCalls, 1);
  release();
  const lateStartResponse = await starting;
  assert.equal(lateStartResponse.status, 202);
  assert.equal(lateStartResponse.payload.execution.status, 'running');
  assert.equal(fixture.project.hostExecutions[0].status, 'cancelled');
  assert.equal(fixture.project.testruns.find((run) => run.id === fixture.project.hostExecutions[0].testRunId).status, 'cancelled');
  assert.deepEqual(events.filter((event) => event.type === 'quality.host-execution.updated').map((event) => event.payload.status), ['queued', 'running', 'cancelled']);
});

test('claims a terminal retry before awaiting so concurrent retries have one successor', async () => {
  const fixture = createHostFixture();
  const first = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { attemptGroupId: 'concurrent_group' }), fakeAdapter({ status: 'failed' }));
  const failed = await waitForHostExecution(fixture.project, first.payload.execution.id, (execution) => execution.status === 'failed');
  const expectedRevision = failed.revision;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slowAdapter = {
    id: 'test-only-browser-use-navigate-slow',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async () => {
      await gate;
      return { status: 'passed' };
    },
  };
  const adapters = new Map([['browser-use:navigate', slowAdapter]]);
  const retryBody = { expectedRevision, qualityTaskRevision: fixture.task.version };
  const firstRetry = callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${first.payload.execution.id}/retry`, retryBody, adapters);
  await waitForProjectHostExecution(fixture.project, (execution) => execution.id !== first.payload.execution.id && execution.status === 'running');
  const secondRetry = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${first.payload.execution.id}/retry`, retryBody, adapters);
  assert.equal(secondRetry.status, 409);
  assert.equal(secondRetry.payload.code, 'HOST_EXECUTION_RETRY_IN_FLIGHT');
  release();
  const retried = await firstRetry;
  await waitForHostExecution(fixture.project, retried.payload.execution.id, (execution) => execution.status === 'passed');
  assert.equal(retried.status, 202);
  assert.equal(fixture.project.hostExecutions.filter((item) => item.attemptGroupId === 'concurrent_group').length, 2);
  assert.equal(fixture.project.hostExecutions.find((item) => item.id === first.payload.execution.id).supersededBy, retried.payload.execution.id);
});

test('only the latest active execution in an attempt group can be retried', async () => {
  const fixture = createHostFixture();
  const first = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { attemptGroupId: 'ordered_group' }));
  const second = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture, { attemptGroupId: 'ordered_group' }));
  const staleRetry = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${first.payload.execution.id}/retry`, {
    expectedRevision: first.payload.execution.revision,
    qualityTaskRevision: fixture.task.version,
  });

  assert.equal(staleRetry.status, 409);
  assert.equal(staleRetry.payload.code, 'HOST_EXECUTION_SUPERSEDED');
  assert.equal(fixture.project.hostExecutions.find((item) => item.id === second.payload.execution.id).supersededBy, undefined);
});

test('missing production adapters produce controlled not_run without shell fallback or fake success', async () => {
  const fixture = createHostFixture();
  const started = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture));
  assert.equal(started.status, 202);
  assert.equal(started.payload.execution.status, 'not_run');
  assert.equal(started.payload.execution.errorCode, 'provider_unavailable');
  assert.equal(started.payload.testRun.status, 'environment-error');
  assert.equal(started.payload.testRun.errorCode, 'provider_unavailable');
});
