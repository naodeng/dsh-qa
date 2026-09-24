import { test, expect } from '@playwright/test';

async function createHostFixture(page, title) {
  const projectResponse = await page.request.post('/api/projects', { data: { title, createWorkspace: false } });
  expect(projectResponse.ok()).toBeTruthy();
  const { project } = await projectResponse.json();
  const taskResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: 'Host checkout smoke' } });
  expect(taskResponse.ok()).toBeTruthy();
  const { task } = await taskResponse.json();
  const profileResponse = await page.request.post(`/api/projects/${project.id}/execution-profiles`, { data: {
    name: 'browser host',
    kind: 'host',
    provider: 'browser-use',
    capabilities: ['navigate'],
    targetPolicy: { origins: ['https://example.test'] },
    artifactPolicy: { logs: true, screenshots: true, trace: true },
    timeoutMs: 30_000,
  } });
  expect(profileResponse.ok()).toBeTruthy();
  const { profile } = await profileResponse.json();
  return { project, task, profile };
}

test('Action Queue receives a missing Host adapter result without a page reload', async ({ page }) => {
  const fixture = await createHostFixture(page, `Action Queue live project-${Date.now()}`);
  await page.goto('/');
  await expect(page.locator('#dashboard-reminders')).toBeVisible();

  const startResponse = await page.request.post(`/api/projects/${fixture.project.id}/quality-tasks/${fixture.task.id}/host-executions`, { data: {
    profileId: fixture.profile.id,
    provider: 'browser-use',
    capability: 'navigate',
    target: 'https://example.test/checkout',
    timeoutMs: 10_000,
    expectedRevision: fixture.task.version,
  } });
  const started = await startResponse.json();
  expect(startResponse.status(), JSON.stringify(started)).toBe(202);
  expect(started.execution.status).toBe('not_run');

  await expect(page.locator('#dashboard-reminders')).toContainText('测试运行失败', { timeout: 5000 });
  await expect(page.locator('#dashboard-reminders')).toContainText('没有可用的宿主适配器', { timeout: 5000 });
  await page.locator('#dashboard-reminders .action-item').filter({ hasText: fixture.project.title }).click();
  await expect(page.locator('#view-project-detail')).toHaveClass(/active/);
  await expect(page.locator('#host-execution-card')).toContainText('未执行');
  const retryResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes(`/api/projects/${fixture.project.id}/host-executions/`)
    && response.url().endsWith('/retry'));
  await page.locator('#host-execution-card [data-host-retry]').click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.status()).toBe(202);
  const retried = await retryResponse.json();
  expect(retried.execution.status).toBe('not_run');
  const queueAfterRetry = await page.request.get('/api/action-queue?limit=50');
  const queueBody = await queueAfterRetry.json();
  const attemptItems = queueBody.items.filter((item) => item.source?.attemptGroupId === retried.execution.attemptGroupId);
  expect(attemptItems).toHaveLength(1);
  expect(attemptItems[0].source.id).toBe(retried.testRun.id);

  await page.locator('#btn-settings').click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('.nav-item[data-view="dashboard"]').click();
  await expect(page.locator('#dashboard-reminders')).toContainText('Test run failed');
  await expect(page.locator('#dashboard-reminders')).toContainText('No host adapter is available');
});

test('项目详情支持 Host 配置、预览确认和受控 not_run 结果', async ({ page }) => {
  const title = `Host 执行配置项目-${Date.now()}`;
  const projectResponse = await page.request.post('/api/projects', { data: { title, createWorkspace: false } });
  expect(projectResponse.ok()).toBeTruthy();
  const { project } = await projectResponse.json();
  await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '支付页面 Host 任务' } });

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#host-execution-card')).toContainText('暂无 Host 执行配置');
  await page.getByRole('button', { name: '新建 Host 配置' }).click();
  await page.locator('#hep-name').fill('browser host from UI');
  await page.getByRole('button', { name: '保存 Host 配置' }).click();
  await expect(page.locator('#host-execution-card')).toContainText('browser host from UI');
  await expect(page.locator('#host-execution-card')).toContainText('预览并执行');

  page.on('dialog', (dialog) => dialog.accept());
  const previewResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes(`/api/projects/${project.id}/quality-tasks/`)
    && response.url().endsWith('/host-executions/preview'));
  const startResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes(`/api/projects/${project.id}/quality-tasks/`)
    && response.url().endsWith('/host-executions')
    && response.status() === 202);
  await page.locator('[data-host-preview]').click();
  const [previewResponse, startResponse] = await Promise.all([previewResponsePromise, startResponsePromise]);
  expect(previewResponse.status()).toBe(200);
  const preview = await previewResponse.json();
  expect(preview.preview.adapterAvailable).toBe(false);
  expect(startResponse.status()).toBe(202);
  const started = await startResponse.json();
  expect(started.execution.status).toBe('not_run');
  await expect(page.locator('#host-execution-card')).toContainText('未执行', { timeout: 5000 });
});

test('Host 缺失目标在界面显示可验证错误且不会启动', async ({ page }) => {
  const fixture = await createHostFixture(page, `Host 缺失目标项目-${Date.now()}`);
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: fixture.project.title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await page.locator('[data-host-target]').fill('');
  await page.locator('[data-host-preview]').click();
  await expect(page.locator('#toast-root .toast.err')).toContainText('请填写执行目标');
  const projectResponse = await page.request.get(`/api/projects/${fixture.project.id}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectBody = await projectResponse.json();
  expect(projectBody.project.hostExecutions).toHaveLength(0);
});
