import { test, expect } from '@playwright/test';

const SESSION_ID = 'attachment-session';

test('standalone mode explains that native attachments require DSH', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="assistant"]').click();

  await expect(page.locator('#btn-attach')).toBeDisabled();
  await expect(page.locator('#attachment-guidance')).toContainText('DSH');
});

test('selects and removes attachments without uploading until Send', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page);
  const frame = fixture.frame;

  const chooserPromise = page.waitForEvent('filechooser');
  await frame.locator('#btn-attach').click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([
    { name: 'requirements.md', mimeType: 'text/markdown', buffer: Buffer.from('# Requirements') },
    { name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) },
  ]);

  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(2);
  expect(fixture.uploads).toHaveLength(0);
  await frame.getByRole('button', { name: '移除 requirements.md' }).click();
  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(1);
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.uploads.length).toBe(0);
  await expect.poll(() => fixture.prompts.length).toBe(1);
  expect(fixture.prompts[0].request.content).toEqual([
    { type: 'image', mediaType: 'image/png', data: 'iVBORw==' , name: 'screenshot.png' },
  ]);
  await expect(frame.locator('.msg-wrap.user .attachment-chip')).toHaveCount(1);
});

test('uploads files as raw DSH binaries and restores attachment chips from history', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page);
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('Review this requirement');
  await frame.locator('#chat-file-input').setInputFiles({
    name: '<requirements>.md', mimeType: 'text/markdown', buffer: Buffer.from('acceptance criteria'),
  });
  expect(fixture.uploads).toHaveLength(0);
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.prompts.length).toBe(1);
  expect(fixture.uploads).toHaveLength(1);
  expect(fixture.uploads[0].contentType).toBe('application/octet-stream');
  expect(fixture.uploads[0].bytes.toString()).toBe('acceptance criteria');
  expect(fixture.prompts[0].request.content).toEqual([
    { type: 'text', text: 'Review this requirement' },
    { type: 'file', receiptId: 'receipt-1' },
  ]);
  await expect(frame.locator('.msg-wrap.user .attachment-chip')).toContainText('<requirements>.md');

  await page.reload();
  const historyFrame = await openEmbeddedProject(page, fixture.title);
  await expect(historyFrame.locator('.msg-wrap.user .attachment-chip')).toContainText('<requirements>.md');
  await expect(historyFrame.locator('.msg-wrap.user .msg')).toContainText('Review this requirement');
});

test('keeps drafts when an attachment command does not declare attachment input', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, { commands: [{ name: 'no-files', input: { attachments: false } }] });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('/no-files inspect');
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes'),
  });
  await frame.locator('#btn-send').click();

  await expect(frame.locator('#chat-input')).toHaveValue('/no-files inspect');
  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(1);
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.commands).toHaveLength(0);
  await expect(frame.locator('#attachment-guidance')).toContainText('未声明支持附件');
});

test('retains text and files after FILE_NOT_STAGED, then reuploads on retry', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, { failFirstPromptAsNotStaged: true });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('Retry with the attachment');
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('retry me'),
  });
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.prompts.length).toBe(1);
  await expect(frame.locator('#chat-input')).toHaveValue('Retry with the attachment');
  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(1);
  await expect(frame.locator('#attachment-guidance')).toContainText('重试');
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.prompts.length).toBe(2);
  expect(fixture.uploads).toHaveLength(2);
  expect(fixture.prompts[1].request.content[1]).toEqual({ type: 'file', receiptId: 'receipt-2' });
});

test('stop during native upload prevents the pending message from being dispatched', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, { holdFirstUpload: true });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('Do not send after Stop');
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'stop.txt', mimeType: 'text/plain', buffer: Buffer.from('stop me'),
  });
  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.uploads.length).toBe(1);
  await frame.locator('#btn-stop').click();
  await expect.poll(() => fixture.cancelCalls).toBe(1);
  await expect.poll(() => fixture.uploadAborted).toBe(true);

  await expect(frame.locator('#btn-send')).toBeEnabled();
  await expect(frame.locator('#chat-input')).toHaveValue('Do not send after Stop');
  await expect(frame.locator('#chat-attachments .attachment-chip')).toContainText('stop.txt');
  expect(fixture.prompts).toHaveLength(0);
  expect(fixture.commands).toHaveLength(0);
});

test('clears attachment drafts when switching projects', async ({ page }) => {
  const nextTitle = `附件 E2E 第二项目 ${Date.now()}`;
  const fixture = await createEmbeddedFixture(page, { secondProjectTitle: nextTitle });
  const frame = fixture.frame;
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'project-a.txt', mimeType: 'text/plain', buffer: Buffer.from('project A'),
  });
  await expect(frame.locator('#chat-attachments .attachment-chip')).toContainText('project-a.txt');

  await page.locator('#case-list .case-item').filter({ hasText: nextTitle }).click();

  await expect(page.locator('#chat-head-title')).toHaveText(nextTitle);
  await expect(page.locator('#chat-attachments .attachment-chip')).toHaveCount(0);
});

test('passes attachments to declaring commands and renders their chips for the current run', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    commands: [{ name: 'with-files', input: { attachments: true } }],
  });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('/with-files review');
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'command.txt', mimeType: 'text/plain', buffer: Buffer.from('command file'),
  });
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.commands.length).toBe(1);
  expect(fixture.commands[0].submittedAttachments).toEqual([{ type: 'file', receiptId: 'receipt-1' }]);
  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user .attachment-chip')).toContainText('command.txt');

  await page.reload();
  const historyFrame = await openEmbeddedProject(page, fixture.title);
  await expect(historyFrame.locator('.msg-wrap.user .msg')).toContainText('/with-files review');
  await expect(historyFrame.locator('.msg-wrap.user .attachment-chip')).toHaveCount(0);
});

test('keeps drafts when a command handler returns an error', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    commands: [{ name: 'with-files', input: { attachments: true } }],
    commandResult: { kind: 'error', text: '命令无法处理这组附件' },
  });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('/with-files review');
  await frame.locator('#chat-file-input').setInputFiles({
    name: 'command.txt', mimeType: 'text/plain', buffer: Buffer.from('command file'),
  });
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.commands.length).toBe(1);
  await expect(frame.locator('#chat-input')).toHaveValue('/with-files review');
  await expect(frame.locator('#chat-attachments .attachment-chip')).toContainText('command.txt');
  await expect(frame.locator('.msg-wrap.ai .msg')).toContainText('命令无法处理这组附件');
});

async function createEmbeddedFixture(page, options = {}) {
  const title = `附件 E2E ${Date.now()} ${Math.random().toString(16).slice(2, 7)}`;
  const createResponse = await page.request.post('/api/projects', {
    data: { title, summary: 'DSH attachment integration fixture', createWorkspace: true },
  });
  expect(createResponse.ok()).toBe(true);
  const created = await createResponse.json();
  const projectId = created.project?.id;
  let workspacePath = created.project?.workspacePath;
  expect(projectId).toBeTruthy();
  if (!workspacePath) {
    const workspaceResponse = await page.request.post(`/api/projects/${encodeURIComponent(projectId)}/workspace`, { data: {} });
    expect(workspaceResponse.ok()).toBe(true);
    workspacePath = (await workspaceResponse.json()).path;
  }
  expect(workspacePath).toBeTruthy();
  const linkResponse = await page.request.patch(`/api/projects/${encodeURIComponent(projectId)}`, {
    data: { dshSessionId: SESSION_ID },
  });
  expect(linkResponse.ok()).toBe(true);
  if (options.secondProjectTitle) {
    const secondProjectResponse = await page.request.post('/api/projects', {
      data: { title: options.secondProjectTitle, createWorkspace: true },
    });
    expect(secondProjectResponse.ok()).toBe(true);
  }

  const fixture = {
    title,
    workspacePath,
    uploads: [],
    prompts: [],
    commands: [],
    records: [],
    failFirstPromptAsNotStaged: Boolean(options.failFirstPromptAsNotStaged),
    commandDefinitions: options.commands || [],
    commandResult: options.commandResult,
    holdNextUpload: Boolean(options.holdFirstUpload),
    uploadAborted: false,
    cancelCalls: 0,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/session/uploadFileBinary') {
      const bytes = request.postDataBuffer() || Buffer.alloc(0);
      const receiptId = `receipt-${fixture.uploads.length + 1}`;
      fixture.uploads.push({
        receiptId,
        contentType: request.headers()['content-type'],
        bytes,
        name: url.searchParams.get('name'),
      });
      const fulfillUpload = () => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, value: { receiptId, file: { name: url.searchParams.get('name'), bytes: bytes.length } } }),
      });
      if (fixture.holdNextUpload) {
        fixture.holdNextUpload = false;
        await new Promise((resolve) => {
          const onRequestFailed = (failedRequest) => {
            if (failedRequest !== request) return;
            fixture.uploadAborted = true;
            page.off('requestfailed', onRequestFailed);
            resolve('aborted');
          };
          page.on('requestfailed', onRequestFailed);
        });
      } else {
        await fulfillUpload();
      }
      return;
    }

    let body;
    try { body = request.postDataJSON(); } catch { /* regular Workbench API */ }
    if (body?.type !== 'client-request') return route.continue();
    const { method, rpcId, payload } = body;
    let value = {};
    if (method === 'agentPresets/list') value = { presets: [{ id: 'qa', name: '测试模式' }] };
    else if (method === 'session/list') value = { items: [{ sessionId: SESSION_ID, cwd: fixture.workspacePath, blank: false, projections: { values: { agentPreset: 'qa' } } }] };
    else if (method === 'session/modelCatalog') value = { default: { provider: 'deepseek', model: 'deepseek-chat' }, groups: [], routable: false };
    else if (method === 'session/create') value = { sessionId: `attachment-session-${fixture.uploads.length}-${Date.now()}` };
    else if (method === 'session/cancel') fixture.cancelCalls += 1;
    else if (method === 'skills/list') value = { skills: [] };
    else if (method === 'commands/list') value = fixture.commandDefinitions;
    else if (method === 'session/prompt') {
      fixture.prompts.push(payload.args);
      const content = payload.args.request.content;
      if (fixture.failFirstPromptAsNotStaged && fixture.prompts.length === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'session/attachment-invalid', message: '附件暂存已失效，请重试', details: { reason: 'FILE_NOT_STAGED' } } } }),
        });
        return;
      }
      const historyContent = content.map((block) => {
        if (block?.type !== 'file') return block;
        const upload = fixture.uploads.find((item) => item.receiptId === block.receiptId);
        return upload ? { ...block, attachment: { name: upload.name, bytes: upload.bytes.length, mediaType: upload.contentType } } : block;
      });
      fixture.records.push({ event: { seq: fixture.records.length, type: 'user/message', data: { message: { source: { kind: 'user' }, content: historyContent } } } });
      fixture.records.push({ event: { seq: fixture.records.length, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '已收到' }] } } } });
      fixture.records.push({ event: { seq: fixture.records.length, type: 'turn/end', data: {} } });
      value = { accepted: true };
    } else if (method === 'commands/execute') {
      fixture.commands.push(payload.args);
      const commandId = `command-${fixture.commands.length}`;
      const [, name = 'command', args = ''] = String(payload.args.line || '').match(/^\/([^\s]+)\s*(.*)$/) || [];
      fixture.records.push({ event: { seq: fixture.records.length, type: 'command/run', data: { commandId, name, args, source: { kind: 'user' } } } });
      const result = fixture.commandResult || { kind: 'success', text: '命令已完成' };
      fixture.records.push({ event: { seq: fixture.records.length, type: 'command/done', data: { commandId, ...result } } });
      value = { commandId, result };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value } }) });
  });

  const embeddedPrefix = '/api/dsh-qa/workbench';
  await page.route('**/api/dsh-qa/workbench/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    requestUrl.pathname = requestUrl.pathname.slice(embeddedPrefix.length) || '/';
    await route.continue({ url: requestUrl.toString() });
  });

  await page.routeWebSocket('**/api/remote.mux', (socket) => {
    socket.onMessage((raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (message.type !== 'open') return;
      socket.send(JSON.stringify({
        type: 'item',
        streamId: message.streamId,
        value: { type: 'snapshot', snapshot: { records: fixture.records, cursor: fixture.records.length - 1 } },
      }));
    });
  });

  await page.goto(`${embeddedPrefix}/`);
  const frame = await openEmbeddedProject(page, title);
  fixture.frame = frame;
  return fixture;
}

async function openEmbeddedProject(page, title) {
  const project = page.locator('#case-list .case-item').filter({ hasText: title });
  await expect(project).toHaveCount(1);
  await page.locator('[data-view="assistant"]').click();
  await expect(project).toBeVisible();
  await project.click();
  await expect(page.locator('#chat-head-title')).toHaveText(title);
  await expect(page.locator('body')).toHaveClass(/dsh-connected/);
  return page.locator('#view-assistant');
}
