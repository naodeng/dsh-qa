import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { authenticateHostPage, parseHostLaunchUrl } from '../support/dsh-host-auth.js';

const hostVersion = process.env.DSH_HOST_VERSION;
const { launchUrl } = parseHostLaunchUrl(process.env.DSH_WEB_URL);
const WORKBENCH_IFRAME = 'iframe[src*="/api/dsh-qa/workbench"]';
let sessionId = '';
let promptQueued = false;
let linkedProjectId = '';

test.describe('DeepSeek Harness host compatibility', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'harness-version', description: hostVersion });
    await authenticateHostPage(page, launchUrl);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (promptQueued && sessionId) {
      try { await rpc(page, 'session/cancel', { request: { sessionId } }); } catch { /* keep the original test result */ }
      promptQueued = false;
    }
    if (linkedProjectId) {
      try { await page.request.delete(`/api/dsh-qa/workbench/api/projects/${encodeURIComponent(linkedProjectId)}`); } catch { /* keep the original test result */ }
      linkedProjectId = '';
    }
    if (testInfo.status === testInfo.expectedStatus) return;
    try {
      await testInfo.attach('host-smoke-failure.png', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } catch {
      // Playwright keeps the trace even when a failure happens before a page exists.
    }
  });

  test('loads the plugin entry and Workbench iframe', async ({ page }) => {
    await openWorkbench(page);
  });

  test('discovers the QA preset and creates and renames a Session', async ({ page }) => {
    await page.goto('/');
    const catalog = await rpc(page, 'agentPresets/list', {});
    const preset = (catalog.presets || []).find((item) => item.id === 'qa');
    expect(preset, 'Harness did not expose the qa preset').toBeTruthy();

    const created = await rpc(page, 'session/create', { request: { agentPreset: preset.id } });
    expect(created.sessionId).toBeTruthy();
    sessionId = created.sessionId;
    await rpc(page, 'session/rename', {
      request: { sessionId, title: `QA 0.4.1 Smoke ${Date.now()}` },
    });
  });

  test('reads follow snapshot, model catalog, Skills, Commands and queues a harmless prompt', async ({ page }) => {
    test.skip(!sessionId, 'Session create case did not produce a session id');
    await openWorkbench(page);

    const snapshot = await followSnapshot(page, sessionId);
    expect(Array.isArray(snapshot.records)).toBe(true);
    expect(Number.isInteger(snapshot.cursor)).toBe(true);

    const modelCatalog = await rpc(page, 'session/modelCatalog', {});
    expect(modelCatalog.default).toBeTruthy();
    const skills = await rpc(page, 'skills/list', { request: { sessionId } });
    expect(Array.isArray(skills.skills)).toBe(true);
    const commands = await rpc(page, 'commands/list', { agentId: sessionId });
    expect(Array.isArray(commands) || Array.isArray(commands.commands)).toBe(true);

    const prompt = await rpc(page, 'session/prompt', {
      request: {
        requestId: `dsh-qa-0.4.1-${randomUUID()}`,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: 'Reply with exactly DSH_QA_0_4_1_OK and nothing else.' }],
        clientTimeZone: 'UTC',
      },
    });
    promptQueued = prompt.accepted === true;
    expect(prompt.accepted).toBe(true);
  });

  test('refreshes the host page and reconnects the embedded Workbench client to the same Session', async ({ page }) => {
    test.skip(!sessionId, 'Session create case did not produce a session id');
    const linked = await createLinkedWorkbenchProject(page, sessionId);
    linkedProjectId = linked.id;

    const clientMethods = [];
    const followSockets = [];
    const observeRequest = (request) => {
      if (request.method() !== 'POST') return;
      try {
        const body = request.postDataJSON();
        if (body?.type === 'client-request') clientMethods.push(body.method);
      } catch { /* non-JSON request */ }
    };
    const observeWebSocket = (socket) => {
      if (socket.url().includes('/api/remote.mux')) followSockets.push(socket.url());
    };
    page.on('request', observeRequest);
    page.on('websocket', observeWebSocket);

    await bindEmbeddedProject(page, linked.title);
    await page.reload();
    await expect(page.locator('[data-dsh-qa-entry]')).toHaveCount(1);
    await bindEmbeddedProject(page, linked.title);

    page.off('request', observeRequest);
    page.off('websocket', observeWebSocket);
    expect(clientMethods).toEqual(expect.arrayContaining([
      'agentPresets/list', 'session/list', 'session/modelCatalog', 'skills/list', 'commands/list',
    ]));
    expect(followSockets.length).toBeGreaterThanOrEqual(2);
  });
});

async function openWorkbench(page) {
  await page.goto('/');
  const entry = await qaEntry(page);
  await expect(entry).toBeVisible();
  await entry.click();
  const iframe = page.locator(WORKBENCH_IFRAME).first();
  await expect(iframe).toBeVisible();
  const frame = page.frameLocator(WORKBENCH_IFRAME).first();
  await expect(frame.locator('#metric-cards')).toBeVisible();
  return frame;
}

async function createLinkedWorkbenchProject(page, id) {
  const title = `QA 0.4.1 Embedded ${Date.now()}`;
  const response = await page.request.post('/api/dsh-qa/workbench/api/projects', {
    data: { title, summary: 'Host smoke client integration fixture', createWorkspace: true },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const projectId = created.project?.id;
  expect(projectId).toBeTruthy();

  const linked = await page.request.patch(`/api/dsh-qa/workbench/api/projects/${encodeURIComponent(projectId)}`, {
    data: { dshSessionId: id },
  });
  expect(linked.ok()).toBe(true);
  return { id: projectId, title };
}

async function bindEmbeddedProject(page, title) {
  const frame = await openWorkbench(page);
  await frame.locator('[data-view="assistant"]').click();
  await expect(frame.locator('#view-assistant')).toHaveClass(/active/);
  const project = frame.locator('#case-list .case-item').filter({ hasText: title });
  await expect(project).toHaveCount(1);
  await expect(project).toBeVisible();
  await project.click();
  await expect(frame.locator('#chat-head-title')).toHaveText(title, { timeout: 30_000 });
  await expect(frame.locator('body')).toHaveClass(/dsh-connected/, { timeout: 30_000 });
  await expect(frame.locator('#capability-count')).toHaveText(/\d+\s*\/\s*\d+/, { timeout: 30_000 });
  return frame;
}

async function rpc(page, method, args) {
  const response = await page.request.post(`/api/${method}`, {
    data: {
      type: 'client-request',
      rpcId: `dsh-qa-0.4.1-${randomUUID()}`,
      method,
      payload: { args },
    },
  });
  if (!response.ok()) throw new Error(`${method} HTTP ${response.status()}`);
  const body = await response.json();
  if (!body.result?.ok) throw new Error(`${method} failed: ${body.result?.error?.message || 'unknown host error'}`);
  return body.result.value;
}

async function qaEntry(page) {
  const markedEntry = page.locator('[data-dsh-qa-entry]').first();
  if (await markedEntry.count()) return markedEntry;
  return page.getByText(/质量工作台|QA Workbench/).first();
}

async function followSnapshot(page, id) {
  const frame = page.frames().find((candidate) => candidate.url().includes('/api/dsh-qa/workbench/'));
  if (!frame) throw new Error('Workbench iframe is not available for follow verification');
  return frame.evaluate(async (sessionId) => {
    const { openFollowSnapshot } = await import('./dsh-rpc-contract.js');
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const streamId = `dsh-qa-0.4.1-${crypto.randomUUID()}`;
    return openFollowSnapshot(new WebSocket(`${scheme}//${location.host}/api/remote.mux`), { streamId, sessionId, maxMessages: 30 });
  }, id);
}
