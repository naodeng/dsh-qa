import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { authenticateHostPage, parseHostLaunchUrl } from '../support/dsh-host-auth.js';

const hostVersion = process.env.DSH_HOST_VERSION;
const { launchUrl } = parseHostLaunchUrl(process.env.DSH_WEB_URL);
let sessionId = '';

test.describe('DeepSeek Harness host compatibility', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'harness-version', description: hostVersion });
    await authenticateHostPage(page, launchUrl);
  });

  test.afterEach(async ({ page }, testInfo) => {
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
    await page.goto('/');
    const entry = await qaEntry(page);
    await expect(entry).toBeVisible();
    await entry.click();
    const iframe = page.locator('iframe[src*="/api/dsh-qa/workbench"]').first();
    await expect(iframe).toBeVisible();
    await expect(page.frameLocator('iframe[src*="/api/dsh-qa/workbench"]').locator('#metric-cards')).toBeVisible();
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
    await page.goto('/');

    const snapshot = await followSnapshot(page, sessionId);
    expect(Array.isArray(snapshot.records)).toBe(true);
    expect(Number.isInteger(snapshot.cursor)).toBe(true);

    const modelCatalog = await rpc(page, 'session/modelCatalog', {});
    expect(modelCatalog.default).toBeTruthy();
    const skills = await rpc(page, 'skills/list', { agentId: sessionId });
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
    expect(prompt.accepted).toBe(true);
  });

  test('refreshes the host page and reconnects to the same Session without duplicate entry', async ({ page }) => {
    test.skip(!sessionId, 'Session create case did not produce a session id');
    await page.goto('/');
    const firstEntry = await qaEntry(page);
    await expect(firstEntry).toBeVisible();
    await page.reload();
    const entries = page.locator('[data-dsh-qa-entry]');
    if (await entries.count()) expect(await entries.count()).toBe(1);
    const entry = await qaEntry(page);
    await entry.click();
    await expect(page.locator('iframe[src*="/api/dsh-qa/workbench"]').first()).toBeVisible();
    const snapshot = await followSnapshot(page, sessionId);
    expect(Number.isInteger(snapshot.cursor)).toBe(true);
  });
});

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
  return page.evaluate(async (sessionId) => {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const streamId = `dsh-qa-0.4.1-${crypto.randomUUID()}`;
    const socket = new WebSocket(`${scheme}//${location.host}/api/remote.mux`);
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener('open', opened);
        socket.removeEventListener('message', message);
        socket.removeEventListener('error', failed);
        socket.removeEventListener('close', closed);
      };
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { socket.close(); } catch {}
        handler(value);
      };
      const opened = () => socket.send(JSON.stringify({
        type: 'open',
        streamId,
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId }, maxMessages: 30 } } },
      }));
      const message = (event) => {
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (!frame || frame.streamId !== streamId) return;
        if (frame.type === 'item' && frame.value?.type === 'snapshot') {
          finish(resolve, { records: frame.value.records || [], cursor: frame.value.cursor ?? -1 });
        } else if (frame.type === 'error') {
          finish(reject, new Error(frame.error?.message || 'session/follow failed'));
        } else if (frame.type === 'end' || frame.type === 'done') {
          finish(reject, new Error('session/follow ended before snapshot'));
        }
      };
      const failed = () => finish(reject, new Error('session/follow WebSocket failed'));
      const closed = () => finish(reject, new Error('session/follow WebSocket closed'));
      socket.addEventListener('open', opened);
      socket.addEventListener('message', message);
      socket.addEventListener('error', failed);
      socket.addEventListener('close', closed);
      timer = setTimeout(() => finish(reject, new Error('session/follow snapshot timeout')), 10_000);
    });
  }, id);
}
