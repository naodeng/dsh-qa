import { test, expect } from '@playwright/test';

const SESSION_ID = 'attachment-session';
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

function sessionIdFromStreamOpen(message) {
  const { payload } = message || {};
  const { args } = payload || {};
  const { request } = args || {};
  const { address } = request || {};
  return address?.sessionId;
}

async function expectRetainedDraft(frame, text, fileName) {
  await expect(frame.locator('#chat-input')).toHaveValue(text);
  await expect(frame.locator('#chat-attachments .attachment-chip')).toContainText(fileName);
}

async function confirmNewDshChat(page, frame, fixture) {
  const previousCreateCalls = fixture.createSessionCalls;
  await frame.locator('.dsh-session-recovery').getByRole('button', { name: '新建 DSH 对话' }).click();
  const dialog = page.locator('#modal-root .modal');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '新建对话', exact: true }).click();
  await expect.poll(() => fixture.createSessionCalls).toBe(previousCreateCalls + 1);
}

test('standalone mode explains that native attachments require DSH', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="assistant"]').click();

  await expect(page.locator('#btn-attach')).toBeDisabled();
  await expect(page.locator('#attachment-guidance')).toContainText('DSH');
  await page.locator('#btn-settings').click();
  await page.locator('[data-settings-lang="en"]').click();
  await expect(page.locator('#btn-attach')).toHaveAttribute('aria-label', 'Add attachments');
  await expect(page.locator('#chat-file-input')).toHaveAttribute('aria-label', 'Choose chat attachments');
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
    { name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.from(ONE_PIXEL_PNG, 'base64') },
  ]);

  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(2);
  expect(fixture.uploads).toHaveLength(0);
  await frame.getByRole('button', { name: '移除 requirements.md' }).click();
  await expect(frame.locator('#chat-attachments .attachment-chip')).toHaveCount(1);
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.uploads.length).toBe(0);
  await expect.poll(() => fixture.prompts.length).toBe(1);
  expect(fixture.prompts[0].request.content).toEqual([
    { type: 'image', mediaType: 'image/png', data: ONE_PIXEL_PNG, name: 'screenshot.png' },
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

test('does not render a pending prompt into a newly selected project', async ({ page }) => {
  const nextTitle = `附件 E2E 第二项目 ${Date.now()}`;
  const fixture = await createEmbeddedFixture(page, { secondProjectTitle: nextTitle, holdPrompt: true });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('Project A prompt');
  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.prompts.length).toBe(1);
  await expect.poll(() => typeof fixture.releasePrompt).toBe('function');

  await page.locator('#case-list .case-item').filter({ hasText: nextTitle }).click();
  await expect(page.locator('#chat-head-title')).toHaveText(nextTitle);
  fixture.releasePrompt();

  await expect(frame.locator('.msg-wrap.user')).toHaveCount(0);
  await expect(frame.locator('#btn-send')).toBeEnabled();
});

test('does not render a pending command into a newly selected project', async ({ page }) => {
  const nextTitle = `附件 E2E 第二项目 ${Date.now()}`;
  const fixture = await createEmbeddedFixture(page, {
    commands: [{ name: 'hold', input: { attachments: false } }],
    secondProjectTitle: nextTitle,
    holdCommand: true,
  });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('/hold inspect');
  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.commands.length).toBe(1);
  await expect.poll(() => typeof fixture.releaseCommand).toBe('function');

  await page.locator('#case-list .case-item').filter({ hasText: nextTitle }).click();
  await expect(page.locator('#chat-head-title')).toHaveText(nextTitle);
  fixture.releaseCommand();
  await expect.poll(() => fixture.commandResponses).toBe(1);

  await expect(frame.locator('.msg-wrap.user')).toHaveCount(0);
  await expect(frame.locator('#btn-send')).toBeEnabled();
});

test('reloading the current project during a turn releases the busy state', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, { holdPrompt: true });
  const frame = fixture.frame;

  await frame.locator('#chat-input').fill('Reload during turn');
  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.prompts.length).toBe(1);
  await expect(frame.locator('#btn-send')).toBeDisabled();

  const projectReload = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/projects/${fixture.projectId}`
    && response.request().method() === 'GET'
  ));
  await page.locator('#case-list .case-item').filter({ hasText: fixture.title }).click();
  await projectReload;
  fixture.releasePrompt();

  await expect(frame.locator('#btn-send')).toBeEnabled();
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
  await expect(frame.locator('.msg-wrap.user')).toHaveCount(0);
});

test('shows a recovery card when the bound DSH session is missing without losing history or drafts', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'missing',
    initialRecords: [
      { event: { seq: 0, type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '之前的需求讨论' }] } } } },
      { event: { seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '之前的测试结论' }] } } } },
    ],
  });
  const frame = fixture.frame;
  const card = frame.locator('.dsh-session-recovery');
  const initialSessionListReads = fixture.sessionListReads;

  await expect(card).toHaveCount(1);
  await expect(card).toContainText('未找到本项目绑定的 DSH 会话');
  await expect(frame.locator('.msg-wrap.user')).toContainText('之前的需求讨论');
  await expect(frame.locator('.msg-wrap.dsh')).toContainText('之前的测试结论');

  await frame.locator('#chat-input').fill('/qa-testcase-generator 新需求');
  await frame.locator('#chat-file-input').setInputFiles({
    name: '需求草稿.md', mimeType: 'text/markdown', buffer: Buffer.from('未发送的需求'),
  });
  await frame.locator('#btn-send').click();

  await expect(card).toHaveCount(1);
  await expectRetainedDraft(frame, '/qa-testcase-generator 新需求', '需求草稿.md');
  await expect(frame.locator('.msg-wrap.user')).toHaveCount(1);
  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 1);
  await expect.poll(() => fixture.prompts.length).toBe(0);

  await card.getByRole('button', { name: '重新检查' }).click();
  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 2);
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(1);
  await expectRetainedDraft(frame, '/qa-testcase-generator 新需求', '需求草稿.md');
  await expect(frame.locator('.msg-wrap.user')).toContainText('之前的需求讨论');
  await expect(frame.locator('.msg-wrap.dsh')).toContainText('之前的测试结论');
  expect(fixture.createSessionCalls).toBe(0);
  expect(fixture.prompts).toHaveLength(0);
  expect(fixture.commands).toHaveLength(0);

  await confirmNewDshChat(page, frame, fixture);
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user')).toHaveCount(1);
  await expect(frame.locator('.msg-wrap.user')).toContainText('之前的需求讨论');
  await expect(frame.locator('.msg-wrap.dsh')).toContainText('之前的测试结论');
  await expectRetainedDraft(frame, '/qa-testcase-generator 新需求', '需求草稿.md');
});

test('does not show a stale recovery retry error after switching projects', async ({ page }) => {
  const secondProjectTitle = `恢复重试第二项目 ${Date.now()}`;
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'unavailable',
    secondProjectTitle,
  });
  const frame = fixture.frame;
  const card = frame.locator('.dsh-session-recovery');
  await expect(card).toContainText('暂时无法读取 DSH 会话列表');
  await page.evaluate(() => {
    window.__dshQaToastMessages = [];
    const root = document.querySelector('#toast-root');
    new MutationObserver(() => {
      for (const toast of root.querySelectorAll('.toast')) {
        if (!window.__dshQaToastMessages.includes(toast.textContent)) window.__dshQaToastMessages.push(toast.textContent);
      }
    }).observe(root, { childList: true, subtree: true, characterData: true });
  });

  fixture.sessionListMode = 'available';
  fixture.modelCatalogHoldRead = fixture.modelCatalogReads + 1;
  await card.getByRole('button', { name: '重新检查' }).click();
  await expect.poll(() => Boolean(fixture.releaseModelCatalog)).toBe(true);

  await page.locator('#case-list .case-item').filter({ hasText: secondProjectTitle }).click();
  await expect(page.locator('#chat-head-title')).toHaveText(secondProjectTitle);
  await waitForEmbeddedChatReady(page, frame);

  fixture.releaseModelCatalog();
  await expect.poll(() => fixture.modelCatalogErrorResponses).toBe(1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const toastMessages = await page.evaluate(() => window.__dshQaToastMessages);
  expect(toastMessages).not.toContain('延迟的 DSH 模型目录错误');
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
});

test('shows recovery when a connected session disappears before sending', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    initialRecords: [
      { event: { seq: 0, type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '已连接会话里的历史需求' }] } } } },
    ],
    rejectNextPromptAsMissing: true,
  });
  const frame = fixture.frame;
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user')).toContainText('已连接会话里的历史需求');

  fixture.sessionListMode = 'missing';
  const initialSessionListReads = fixture.sessionListReads;
  await frame.locator('#chat-input').fill('新提问草稿');
  await frame.locator('#chat-file-input').setInputFiles({
    name: '新提问.md', mimeType: 'text/markdown', buffer: Buffer.from('未发送内容'),
  });
  await frame.locator('#btn-send').click();

  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 1);
  await expect(frame.locator('.dsh-session-recovery')).toContainText('未找到本项目绑定的 DSH 会话');
  await expect(frame.locator('.msg-wrap.user')).toHaveCount(1);
  await expect(frame.locator('.msg-wrap.user')).toContainText('已连接会话里的历史需求');
  await expectRetainedDraft(frame, '新提问草稿', '新提问.md');

  const readsBeforeRetry = fixture.sessionListReads;
  await frame.locator('.dsh-session-recovery').getByRole('button', { name: '重新检查' }).click();
  await expect.poll(() => fixture.sessionListReads).toBe(readsBeforeRetry + 1);
  await expect(frame.locator('.dsh-session-recovery')).toContainText('未找到本项目绑定的 DSH 会话');
  await expect(frame.locator('.msg-wrap.user')).toContainText('已连接会话里的历史需求');
  await expectRetainedDraft(frame, '新提问草稿', '新提问.md');
  expect(fixture.createSessionCalls).toBe(0);
});

test('retrying an unbound project never creates a DSH session without confirmation', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'unavailable',
    unboundSession: true,
  });
  const frame = fixture.frame;
  const card = frame.locator('.dsh-session-recovery');

  await expect(card).toContainText('暂时无法读取 DSH 会话列表');
  await frame.locator('#chat-input').fill('尚未发送的需求');
  await frame.locator('#chat-file-input').setInputFiles({
    name: '未发送需求.md', mimeType: 'text/markdown', buffer: Buffer.from('草稿内容'),
  });
  fixture.sessionListMode = 'available';
  const initialSessionListReads = fixture.sessionListReads;
  await card.getByRole('button', { name: '重新检查' }).click();

  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 1);
  await expect(card).toContainText('本项目尚未绑定 DSH 会话');
  await expectRetainedDraft(frame, '尚未发送的需求', '未发送需求.md');
  expect(fixture.createSessionCalls).toBe(0);

  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 2);
  await expect(card).toContainText('本项目尚未绑定 DSH 会话');
  await expectRetainedDraft(frame, '尚未发送的需求', '未发送需求.md');
  expect(fixture.createSessionCalls).toBe(0);
  expect(fixture.prompts).toHaveLength(0);

  await confirmNewDshChat(page, frame, fixture);
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expectRetainedDraft(frame, '尚未发送的需求', '未发送需求.md');
});

test('retrying an incompatible bound session does not replace it without confirmation', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'unavailable',
    sessionPreset: 'legacy',
    initialRecords: [
      { event: { seq: 0, type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '保留的旧会话历史' }] } } } },
    ],
  });
  const frame = fixture.frame;
  const card = frame.locator('.dsh-session-recovery');
  await expect(card).toContainText('暂时无法读取 DSH 会话列表');

  fixture.sessionListMode = 'available';
  const initialSessionListReads = fixture.sessionListReads;
  await card.getByRole('button', { name: '重新检查' }).click();

  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 1);
  await expect(card).toContainText('当前 DSH 会话无法直接恢复');
  await expect(frame.locator('.msg-wrap.user')).toContainText('保留的旧会话历史');
  expect(fixture.createSessionCalls).toBe(0);

  await frame.locator('#chat-input').fill('不应自动替换旧会话');
  await frame.locator('#btn-send').click();
  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 2);
  await expect(card).toContainText('当前 DSH 会话无法直接恢复');
  await expect(frame.locator('.msg-wrap.user')).toContainText('保留的旧会话历史');
  await expect(frame.locator('#chat-input')).toHaveValue('不应自动替换旧会话');
  expect(fixture.createSessionCalls).toBe(0);
  expect(fixture.prompts).toHaveLength(0);

  await confirmNewDshChat(page, frame, fixture);
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user')).toContainText('保留的旧会话历史');
});

test('keeps visible conversation history if a new chat cannot reload the archived session', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'missing',
    failArchivedHistoryAfterNewSession: true,
    initialRecords: [
      { event: { seq: 0, type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '仍在界面中的旧需求' }] } } } },
      { event: { seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '旧会话中的测试结论' }] } } } },
    ],
  });
  const frame = fixture.frame;
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(1);
  await expect(frame.locator('.msg-wrap.user')).toContainText('仍在界面中的旧需求');
  await expect(frame.locator('.msg-wrap.dsh')).toContainText('旧会话中的测试结论');

  await confirmNewDshChat(page, frame, fixture);

  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user')).toContainText('仍在界面中的旧需求');
  await expect(frame.locator('.msg-wrap.dsh')).toContainText('旧会话中的测试结论');
});

test('distinguishes an unreadable DSH session list from a missing bound session', async ({ page }) => {
  const fixture = await createEmbeddedFixture(page, {
    sessionListMode: 'unavailable',
    initialRecords: [
      { event: { seq: 0, type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '仍需保留的历史内容' }] } } } },
    ],
  });
  const frame = fixture.frame;
  const card = frame.locator('.dsh-session-recovery');
  const initialSessionListReads = fixture.sessionListReads;

  await expect(card).toHaveCount(1);
  await expect(card).toContainText('暂时无法读取 DSH 会话列表');
  await expect(frame.locator('.msg-wrap.user')).toContainText('仍需保留的历史内容');
  await expect(card).toContainText('重新检查');
  await expect(card).toContainText('新建 DSH 对话');

  await frame.locator('#chat-input').fill('暂存中的提问');
  await frame.locator('#chat-file-input').setInputFiles({
    name: '会话列表故障草稿.md', mimeType: 'text/markdown', buffer: Buffer.from('未发送的需求'),
  });
  await frame.locator('#btn-send').click();
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(1);
  await expect(frame.locator('.msg-wrap.user')).toContainText('仍需保留的历史内容');
  await expectRetainedDraft(frame, '暂存中的提问', '会话列表故障草稿.md');
  await card.getByRole('button', { name: '重新检查' }).click();

  await expect.poll(() => fixture.sessionListReads).toBe(initialSessionListReads + 2);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('暂时无法读取 DSH 会话列表');
  await expect(frame.locator('.msg-wrap.user')).toContainText('仍需保留的历史内容');
  await expectRetainedDraft(frame, '暂存中的提问', '会话列表故障草稿.md');
  expect(fixture.createSessionCalls).toBe(0);
  expect(fixture.prompts).toHaveLength(0);
});

test('does not show a stale DSH session recovery card after switching projects', async ({ page }) => {
  const secondProjectTitle = `附件 E2E 第二项目 ${Date.now()}`;
  const fixture = await createEmbeddedFixture(page, { secondProjectTitle });
  const frame = fixture.frame;
  const firstProject = page.locator('#case-list .case-item').filter({ hasText: fixture.title });
  const secondProject = page.locator('#case-list .case-item').filter({ hasText: secondProjectTitle });

  await secondProject.click();
  await expect(page.locator('#chat-head-title')).toHaveText(secondProjectTitle);
  await waitForEmbeddedChatReady(page, frame);
  await frame.locator('#chat-input').fill('B 项目的现有对话');
  await frame.locator('#btn-send').click();
  await expect(frame.locator('.msg-wrap.user')).toContainText('B 项目的现有对话');

  fixture.sessionListHoldRead = fixture.sessionListReads + 1;
  await firstProject.click();
  await expect(page.locator('#chat-head-title')).toHaveText(fixture.title);
  await expect.poll(() => fixture.sessionListReads).toBe(fixture.sessionListHoldRead);

  await secondProject.click();
  await expect(page.locator('#chat-head-title')).toHaveText(secondProjectTitle);
  await waitForEmbeddedChatReady(page, frame);

  const errorResponses = fixture.sessionListErrorResponses;
  fixture.releaseSessionList();
  await expect.poll(() => fixture.sessionListErrorResponses).toBe(errorResponses + 1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(frame.locator('.dsh-session-recovery')).toHaveCount(0);
  await expect(frame.locator('.msg-wrap.user')).toContainText('B 项目的现有对话');
  await expect(page.locator('#chat-head-title')).toHaveText(secondProjectTitle);
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
  if (!options.unboundSession) {
    const linkResponse = await page.request.patch(`/api/projects/${encodeURIComponent(projectId)}`, {
      data: { dshSessionId: SESSION_ID },
    });
    expect(linkResponse.ok()).toBe(true);
  }
  if (options.secondProjectTitle) {
    const secondProjectResponse = await page.request.post('/api/projects', {
      data: { title: options.secondProjectTitle, createWorkspace: true },
    });
    expect(secondProjectResponse.ok()).toBe(true);
  }

  const fixture = {
    title,
    projectId,
    workspacePath,
    uploads: [],
    prompts: [],
    commands: [],
    sessionListReads: 0,
    sessionListErrorResponses: 0,
    sessionListHoldRead: 0,
    releaseSessionList: null,
    modelCatalogReads: 0,
    modelCatalogHoldRead: 0,
    modelCatalogErrorResponses: 0,
    releaseModelCatalog: null,
    createSessionCalls: 0,
    createdSessionIds: [],
    commandResponses: 0,
    recordsBySession: new Map([[SESSION_ID, options.initialRecords || []]]),
    sessionListMode: options.sessionListMode || 'available',
    unboundSession: Boolean(options.unboundSession),
    sessionPreset: options.sessionPreset || 'qa',
    failArchivedHistoryAfterNewSession: Boolean(options.failArchivedHistoryAfterNewSession),
    failFirstPromptAsNotStaged: Boolean(options.failFirstPromptAsNotStaged),
    rejectNextPromptAsMissing: Boolean(options.rejectNextPromptAsMissing),
    holdNextPrompt: Boolean(options.holdPrompt),
    holdNextCommand: Boolean(options.holdCommand),
    commandDefinitions: options.commands || [],
    commandResult: options.commandResult,
    holdNextUpload: Boolean(options.holdFirstUpload),
    uploadAborted: false,
    cancelCalls: 0,
  };
  const sessionRecords = (sessionId) => {
    if (!fixture.recordsBySession.has(sessionId)) fixture.recordsBySession.set(sessionId, []);
    return fixture.recordsBySession.get(sessionId);
  };
  const appendSessionEvent = (sessionId, type, data) => {
    const records = sessionRecords(sessionId);
    records.push({ event: { seq: records.length, type, data } });
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
    else if (method === 'session/list') {
      fixture.sessionListReads += 1;
      const heldRead = fixture.sessionListReads === fixture.sessionListHoldRead;
      if (heldRead) await new Promise((resolve) => { fixture.releaseSessionList = resolve; });
      if (fixture.sessionListMode === 'unavailable' || heldRead) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'session/list-unavailable', message: 'DSH 会话列表暂不可读' } } }) });
        fixture.sessionListErrorResponses += 1;
        return;
      }
      const items = fixture.sessionListMode === 'missing' || fixture.unboundSession
        ? []
        : [{ sessionId: SESSION_ID, cwd: fixture.workspacePath, blank: false, projections: { values: { agentPreset: fixture.sessionPreset } } }];
      fixture.createdSessionIds.forEach((sessionId) => items.push({ sessionId, cwd: fixture.workspacePath, blank: true, projections: { values: { agentPreset: 'qa' } } }));
      value = { items };
    }
    else if (method === 'session/modelCatalog') {
      fixture.modelCatalogReads += 1;
      if (fixture.modelCatalogReads === fixture.modelCatalogHoldRead) {
        await new Promise((resolve) => { fixture.releaseModelCatalog = resolve; });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'model-catalog-unavailable', message: '延迟的 DSH 模型目录错误' } } }) });
        fixture.modelCatalogErrorResponses += 1;
        return;
      }
      value = { default: { provider: 'deepseek', model: 'deepseek-chat' }, groups: [], routable: false };
    }
    else if (method === 'session/create') {
      fixture.createSessionCalls += 1;
      const sessionId = `attachment-session-${fixture.createSessionCalls}-${Date.now()}`;
      fixture.createdSessionIds.push(sessionId);
      sessionRecords(sessionId);
      value = { sessionId };
    }
    else if (method === 'session/cancel') fixture.cancelCalls += 1;
    else if (method === 'skills/list') value = { skills: [] };
    else if (method === 'commands/list') {
      value = fixture.commandDefinitions;
    }
    else if (method === 'session/prompt') {
      fixture.prompts.push(payload.args);
      if (fixture.rejectNextPromptAsMissing) {
        fixture.rejectNextPromptAsMissing = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'session/not-found', message: 'DSH 会话不存在' } } }),
        });
        return;
      }
      if (fixture.holdNextPrompt) {
        fixture.holdNextPrompt = false;
        await new Promise((resolve) => { fixture.releasePrompt = resolve; });
      }
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
      const sessionId = payload.args.request.sessionId;
      appendSessionEvent(sessionId, 'user/message', { message: { source: { kind: 'user' }, content: historyContent } });
      appendSessionEvent(sessionId, 'assistant/message', { message: { content: [{ type: 'text', text: '已收到' }] } });
      appendSessionEvent(sessionId, 'turn/end', {});
      value = { accepted: true };
    } else if (method === 'commands/execute') {
      fixture.commands.push(payload.args);
      if (fixture.holdNextCommand) {
        fixture.holdNextCommand = false;
        await new Promise((resolve) => { fixture.releaseCommand = resolve; });
      }
      const commandId = `command-${fixture.commands.length}`;
      const [, name = 'command', args = ''] = String(payload.args.line || '').match(/^\/([^\s]+)\s*(.*)$/) || [];
      appendSessionEvent(payload.args.agentId, 'command/run', { commandId, name, args, source: { kind: 'user' } });
      const result = fixture.commandResult || { kind: 'success', text: '命令已完成' };
      appendSessionEvent(payload.args.agentId, 'command/done', { commandId, ...result });
      value = { commandId, result };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value } }) });
    if (method === 'commands/execute') fixture.commandResponses += 1;
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
      const sessionId = sessionIdFromStreamOpen(message);
      if (fixture.failArchivedHistoryAfterNewSession && fixture.createSessionCalls > 0 && sessionId === SESSION_ID) {
        socket.send(JSON.stringify({ type: 'error', streamId: message.streamId, error: { message: '历史记录暂时不可读' } }));
        return;
      }
      const records = fixture.recordsBySession.get(sessionId) || [];
      socket.send(JSON.stringify({
        type: 'item',
        streamId: message.streamId,
        value: { type: 'snapshot', snapshot: { records, cursor: records.length - 1 } },
      }));
    });
  });

  await page.goto(`${embeddedPrefix}/`);
  const frame = await openEmbeddedProject(page, title);
  await waitForEmbeddedChatReady(page, frame);
  fixture.frame = frame;
  return fixture;
}

async function waitForEmbeddedChatReady(page, frame) {
  await expect.poll(async () => {
    if (await frame.locator('.dsh-session-recovery').count()) return true;
    if (!await page.locator('body').evaluate((body) => body.classList.contains('dsh-connected'))) return false;
    if (await frame.locator('#chat-msgs .msg-wrap').count()) return true;
    const emptyCopy = frame.locator('#chat-msgs .chat-empty p');
    return await emptyCopy.count() > 0 && !(await emptyCopy.textContent()).includes('正在连接');
  }).toBe(true);
}

async function openEmbeddedProject(page, title) {
  const project = page.locator('#case-list .case-item').filter({ hasText: title });
  await expect(project).toHaveCount(1);
  await page.locator('[data-view="assistant"]').click();
  await expect(project).toBeVisible();
  await project.click();
  await expect(page.locator('#chat-head-title')).toHaveText(title);
  return page.locator('#view-assistant');
}
