import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-host-api-'));
process.env.QA_DATA_DIR = dataDir;

const store = await import('../../server/store.js');
const { createExecutionProfile } = await import('../../server/quality/execution-profile.js');
const { handleQualityRoutes } = await import('../../server/quality/http-routes.js');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function responseRecorder() {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
  return response;
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
  return true;
}

async function callRoute(method, pathname, body = {}, hostAdapters = new Map(), events = []) {
  const res = responseRecorder();
  const handled = await handleQualityRoutes({
    req: { method },
    res,
    url: new URL(`http://localhost${pathname}`),
    body,
    store,
    hostAdapters,
    broadcast: (type, payload) => events.push({ type, payload }),
    emitProject: () => {},
    ok: (response, payload) => jsonResponse(response, 200, { ok: true, ...payload }),
    created: (response, payload) => jsonResponse(response, 201, { ok: true, ...payload }),
    accepted: (response, payload) => jsonResponse(response, 202, { ok: true, ...payload }),
    fail: (response, status, error, code) => jsonResponse(response, status, { ok: false, error, ...(code ? { code } : {}) }),
  });
  assert.equal(handled, true, `route was not handled: ${method} ${pathname}`);
  return { status: res.statusCode, payload: JSON.parse(res.body) };
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

  assert.equal(computer.status, 202);
  assert.equal(computer.payload.execution.status, 'passed');
  assert.equal(computer.payload.execution.artifacts[0].relativePath, 'computer-use.log');
  assert.equal(mcp.status, 202);
  assert.equal(mcp.payload.execution.status, 'passed');
  assert.equal(mcp.payload.execution.targetMetadata.kind, 'mcp-tool');
  assert.equal(mcp.payload.execution.artifacts[2].relativePath, 'mcp.zip');
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
    assert.equal(started.payload.execution.status, hostStatus);
    assert.equal(started.payload.testRun.status, testRunStatus);
    if (errorCode) assert.equal(started.payload.testRun.errorCode, errorCode);
  }

  const passed = fixture.project.hostExecutions.find((execution) => execution.status === 'passed');
  assert.equal(passed.attemptGroupId, 'group_passed');
  assert.equal(passed.request.command, undefined);
  assert.equal(passed.artifactDir, undefined);
  assert.equal(passed.stagingRoot, undefined);
  assert.equal(passed.artifacts[0].relativePath, 'run.log');
  assert.equal(path.isAbsolute(passed.artifacts[0].relativePath), false);
  assert.equal(events.filter((event) => event.type === 'quality.host-execution.updated').length, statuses.length);
  assert.equal(events.filter((event) => event.type === 'quality.test-run.updated').length, statuses.length);
});

test('gets and cancels a running host execution with expectedRevision', async () => {
  const fixture = createHostFixture();
  const events = [];
  const started = await callRoute('POST', `/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, hostInput(fixture), fakeAdapter({ status: 'running' }), events);
  const executionId = started.payload.execution.id;
  assert.equal(started.payload.execution.revision, 1);

  const status = await callRoute('GET', `/api/projects/${fixture.project.id}/host-executions/${executionId}`, {}, new Map(), events);
  assert.equal(status.status, 200);
  assert.equal(status.payload.execution.status, 'running');
  assert.equal(status.payload.testRun.status, 'running');

  const cancelled = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${executionId}/cancel`, { expectedRevision: 1 }, new Map(), events);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.execution.status, 'cancelled');
  assert.equal(cancelled.payload.execution.revision, 2);
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
  const retried = await callRoute('POST', `/api/projects/${fixture.project.id}/host-executions/${oldId}/retry`, { expectedRevision: 1 }, fakeAdapter({ status: 'running' }), events);

  assert.equal(retried.status, 202);
  assert.notEqual(retried.payload.execution.id, oldId);
  assert.equal(retried.payload.execution.attemptGroupId, 'stable_group');
  assert.equal(retried.payload.execution.status, 'running');
  assert.equal(fixture.project.hostExecutions.find((item) => item.id === oldId).supersededBy, retried.payload.execution.id);
  assert.equal(events.filter((event) => event.type === 'quality.host-execution.updated').length, 3);
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
