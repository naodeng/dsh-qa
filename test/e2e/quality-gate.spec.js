import { test, expect } from '../support/e2e-test.js';

test('质量任务风险、质量门禁和证据各自在对应工作区可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = `交付质量工作区-${Date.now()}`;
  const projectResponse = await page.request.post('/api/projects', { data: { title, createWorkspace: false } });
  expect(projectResponse.ok()).toBeTruthy();
  const { project } = await projectResponse.json();
  const taskResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '门禁与回调任务' } });
  const { task } = await taskResponse.json();
  const analysisResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks/${task.id}/manual-analyses`, { data: {
    expectedRevision: task.version,
    actorLabel: '测试负责人',
    sourceDigests: [],
    acceptanceCriteria: [{ id: 'accept-1', condition: '签名错误的支付回调必须拒绝' }],
    risks: [{ id: 'risk-1', title: '回调验签风险', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
    testScope: [{ id: 'scope-1', title: '支付回调接口' }],
  } });
  expect(analysisResponse.ok()).toBeTruthy();

  const bundleId = 'ev_browser_verified';
  const computedGateId = 'gate_computed_ui_only';
  const longEvidenceName = `${'unbroken-evidence-name-'.repeat(12)}results.txt`;
  await page.route(`**/api/projects/${project.id}`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.gates = [...(payload.project.gates || []), {
      id: computedGateId,
      kind: 'computed',
      qualityTaskId: task.id,
      verdict: 'BLOCK',
      checks: [{ key: 'sample', status: 'failed', explanation: '仅用于任务评估' }],
    }];
    payload.project.evidenceBundles = [{
      id: bundleId,
      testRunId: 'run_browser_verified',
      qualityTaskId: task.id,
      state: 'ready',
      integrity: 'verified',
      totalSize: 40,
      items: [
        { id: 'item_log', type: 'log', relativePath: 'results.txt', mimeType: 'text/plain', size: 20 },
        { id: 'item_trace', type: 'trace', relativePath: 'trace.zip', mimeType: 'application/zip', size: 20 },
        { id: 'item_long', type: 'log', relativePath: longEvidenceName, mimeType: 'text/plain', size: 20 },
      ],
    }];
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: title }).click();
  await page.locator('#project-detail-tabs [data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#quality-task-detail')).toContainText('回调验签风险');
  await expect(page.locator('#quality-task-detail')).not.toContainText('质量门禁');
  await page.locator('#project-detail-tabs [data-detail-tab="defectsRisks"]').click();
  await expect(page.locator('#quality-risk-records')).toContainText('回调验签风险');
  await expect(page.locator('#defect-records')).toContainText('暂无缺陷记录');

  await page.locator('#project-detail-tabs [data-detail-tab="delivery"]').click();
  await expect(page.locator('#quality-gate-summary')).toBeVisible();
  await expect(page.locator('#detail-delivery-reports')).toContainText('暂无报告记录');
  await expect(page.locator('#detail-delivery-evidence')).toContainText(bundleId);
  await expect(page.locator('#detail-delivery-evidence')).toContainText('已验证');
  await page.getByRole('button', { name: '评估质量门禁' }).click();
  await expect(page.locator('#gate-report')).toContainText('BLOCK');
  await expect(page.locator('#gate-trend')).toContainText('BLOCK');
  await expect(page.getByRole('button', { name: '添加门禁例外' })).toBeVisible();

  const download = page.getByRole('link', { name: /下载 trace\.zip/ });
  await expect(download).toHaveAttribute('download', '');
  await expect(download).toHaveAttribute('href', new RegExp(`api/projects/${project.id}/evidence/${bundleId}/items/item_trace/download$`));
  const open = page.getByRole('link', { name: /打开 results\.txt/ });
  await expect(open).not.toHaveAttribute('download', '');
  await expect(open).toHaveAttribute('href', new RegExp(`api/projects/${project.id}/evidence/${bundleId}/items/item_log/download$`));

  const longLink = page.locator('[data-evidence-item-id="item_long"] a');
  await expect(longLink).toBeVisible();
  const longLinkLayout = await longLink.evaluate((element) => ({
    containerWidth: element.closest('.delivery-evidence-items').clientWidth,
    itemWidth: element.closest('.evidence-item').getBoundingClientRect().width,
    linkWidth: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect.soft(longLinkLayout.itemWidth).toBeLessThanOrEqual(longLinkLayout.containerWidth);
  expect.soft(longLinkLayout.linkWidth).toBeLessThanOrEqual(longLinkLayout.containerWidth);
  expect.soft(longLinkLayout.scrollWidth).toBeLessThanOrEqual(longLinkLayout.linkWidth);
  expect.soft(longLinkLayout.height).toBeGreaterThan(44);
  const computedGate = page.locator(`#detail-delivery-gates [data-gate-id="${computedGateId}"]`);
  await expect(computedGate).toContainText('自动评估 · BLOCK');
  await expect(computedGate.locator('[data-decision]')).toHaveCount(0);
  await expect(page.locator('#detail-delivery-gates')).not.toContainText('已驳回');
});

test('迟到的门禁评估不会覆盖切换后的任务报告', async ({ page }) => {
  const title = `门禁请求隔离-${Date.now()}`;
  const { project } = await (await page.request.post('/api/projects', { data: { title, createWorkspace: false } })).json();
  const taskA = (await (await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '任务 A' } })).json()).task;
  const taskB = (await (await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '任务 B' } })).json()).task;

  let releaseEvaluation;
  let evaluationStarted;
  const evaluationReady = new Promise((resolve) => { evaluationStarted = resolve; });
  let reportLoaded;
  let trendLoaded;
  const reportReady = new Promise((resolve) => { reportLoaded = resolve; });
  const trendReady = new Promise((resolve) => { trendLoaded = resolve; });
  await page.route(`**/api/projects/${project.id}/quality-tasks/${taskA.id}/gates/evaluate`, async (route) => {
    evaluationStarted();
    await new Promise((resolve) => { releaseEvaluation = resolve; });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, gate: { id: 'late_gate_a', verdict: 'BLOCK', checks: [] } }) });
  });
  await page.route(`**/api/projects/${project.id}/quality-tasks/${taskA.id}/reports`, async (route) => {
    reportLoaded();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, report: { verdict: 'BLOCK', checks: [{ explanation: 'late task-a result' }] } }) });
  });
  await page.route(`**/api/projects/${project.id}/quality-tasks/${taskA.id}/gate-trends`, async (route) => {
    trendLoaded();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, trend: { series: [{ verdict: 'BLOCK' }] } }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: title }).click();
  await page.locator('#project-detail-tabs [data-detail-tab="delivery"]').click();
  await page.locator('#delivery-quality-task').selectOption(taskA.id);
  await page.getByRole('button', { name: '评估质量门禁' }).click();
  await evaluationReady;
  await page.locator('#delivery-quality-task').selectOption(taskB.id);
  await expect(page.locator('#gate-report')).toContainText('评估后');
  releaseEvaluation();
  await Promise.all([reportReady, trendReady]);
  await expect(page.locator('#gate-report')).not.toContainText('late task-a result');
  await expect(page.locator('#gate-trend')).not.toContainText('BLOCK');
});

test('迟到的项目门禁汇总不会覆盖另一个项目', async ({ page }) => {
  const projectA = (await (await page.request.post('/api/projects', { data: { title: `汇总项目 A-${Date.now()}`, createWorkspace: false } })).json()).project;
  const projectB = (await (await page.request.post('/api/projects', { data: { title: `汇总项目 B-${Date.now()}`, createWorkspace: false } })).json()).project;
  let releaseA;
  let startedA;
  const started = new Promise((resolve) => { startedA = resolve; });
  const responseA = page.waitForResponse((response) => response.url().includes(`/api/projects/${projectA.id}/quality-gate`) && response.status() === 200);
  await page.route(`**/api/projects/${projectA.id}/quality-gate`, async (route) => {
    startedA();
    await new Promise((resolve) => { releaseA = resolve; });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, gate: { status: 'blocked', blockers: ['project-a-only-blocker'] } }) });
  });
  await page.route(`**/api/projects/${projectB.id}/quality-gate`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, gate: { status: 'not-evaluated', blockers: [] } }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectA.title }).click();
  await page.locator('#project-detail-tabs [data-detail-tab="delivery"]').click();
  await started;
  await page.getByRole('button', { name: /返回项目看板/ }).click();
  await page.locator('.card').filter({ hasText: projectB.title }).click();
  await page.locator('#project-detail-tabs [data-detail-tab="delivery"]').click();
  await expect(page.locator('#quality-gate-summary h3')).toHaveText('项目级质量门禁');
  await expect(page.locator('#quality-gate-status')).toHaveText('项目级 · 未评估');
  releaseA();
  await responseA;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.locator('#quality-gate-status')).toHaveText('项目级 · 未评估');
  await expect(page.locator('#quality-gate-summary')).not.toContainText('project-a-only-blocker');
});
