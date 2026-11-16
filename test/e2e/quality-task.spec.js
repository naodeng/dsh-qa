import { test, expect } from '../support/e2e-test.js';

test('项目详情可以创建质量任务并在刷新后保留', async ({ page }) => {
  const projectTitle = `质量任务浏览器项目-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '新建测试项目' }).click();
  await page.locator('#nc-title').fill(projectTitle);
  await page.locator('#nc-workspace').uncheck();
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectTitle }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await page.getByRole('button', { name: '新建质量任务' }).click();
  await page.getByLabel('任务名称').fill('支付回调风险');
  await page.getByRole('button', { name: '创建任务' }).click();
  await expect(page.getByRole('heading', { name: '支付回调风险' })).toBeVisible();
  await expect(page.getByText('结果来源：人工录入')).toBeVisible();
  const acceptanceHeading = page.locator('.quality-task-card .quality-task-fields > section:first-child h4');
  await expect(acceptanceHeading).toHaveText('验收标准');
  await expect.poll(() => acceptanceHeading.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing };
  })).toEqual({ fontSize: '14px', fontWeight: '600', letterSpacing: 'normal' });
  await page.reload();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectTitle }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#quality-task-list [data-quality-task-select]')).toHaveCount(1);
  await expect(page.locator('#quality-task-detail')).toContainText('支付回调风险');
});

test('质量任务按确认信号排序，选择后显示对应范围和风险', async ({ page }) => {
  const projectResponse = await page.request.post('/api/projects', { data: { title: `任务工作流项目-${Date.now()}`, createWorkspace: false } });
  expect(projectResponse.ok()).toBeTruthy();
  const { project } = await projectResponse.json();
  const olderResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '一般回归任务' } });
  const attentionResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '支付回调风险任务' } });
  expect(olderResponse.ok()).toBeTruthy();
  expect(attentionResponse.ok()).toBeTruthy();
  const { task: olderTask } = await olderResponse.json();
  const { task: attentionTask } = await attentionResponse.json();

  const analysisResponse = await page.request.post(`/api/projects/${project.id}/quality-tasks/${olderTask.id}/manual-analyses`, { data: {
    expectedRevision: olderTask.version,
    actorLabel: '测试负责人',
    sourceDigests: [],
    acceptanceCriteria: [{ id: 'accept-1', condition: '验签失败的支付回调必须拒绝处理' }],
    risks: [{ id: 'risk-1', title: '回调可能未验签', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
    testScope: [{ id: 'scope-1', title: '支付回调接口' }],
  } });
  expect(analysisResponse.ok()).toBeTruthy();
  const queueResponse = await page.request.get(`/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`);
  const confirmationItem = (await queueResponse.json()).items.find((item) => item.kind === 'quality_task_confirm' && item.entityId === olderTask.id);
  expect(confirmationItem).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  const taskChoices = page.locator('#quality-task-list [data-quality-task-select]');
  await expect(taskChoices).toHaveCount(2);
  await expect(taskChoices.first()).toHaveAttribute('data-quality-task-select', olderTask.id);
  await expect(taskChoices.first()).toContainText('需确认');
  await expect(taskChoices.first()).toContainText('回调可能未验签');
  await expect(taskChoices.first()).toContainText('致命');
  await expect(page.locator('#quality-task-detail [data-quality-task-id]')).toHaveAttribute('data-quality-task-id', olderTask.id);
  await expect(page.locator('#quality-task-detail')).toContainText('验签失败的支付回调必须拒绝处理');
  await expect(page.locator('#quality-task-detail')).toContainText('回调可能未验签');
  await expect(page.locator('#quality-task-detail')).toContainText('支付回调接口');
  await expect(page.locator('#quality-task-detail')).toContainText('intake');

  await taskChoices.nth(1).click();
  await expect(page.locator('#quality-task-detail [data-quality-task-id]')).toHaveAttribute('data-quality-task-id', attentionTask.id);
  await expect(page.locator('#quality-task-detail')).toContainText('支付回调风险任务');

  await page.locator('#project-detail-tabs [data-detail-tab="overview"]').click();
  await page.locator(`#project-action-queue [data-action-id="${confirmationItem.id}"]`).click();
  await expect(page.locator('#project-detail-tabs [data-detail-tab="qualityTasks"].active')).toBeVisible();
  await expect(page.locator('#quality-task-detail [data-quality-task-id]')).toHaveAttribute('data-quality-task-id', olderTask.id);
});

test('长任务列表由项目详情页面滚动承载', async ({ page, request }) => {
  const response = await request.post('/api/projects', {
    data: { title: `长任务列表项目-${Date.now()}`, createWorkspace: false },
  });
  expect(response.ok()).toBe(true);
  const { project } = await response.json();
  for (let index = 0; index < 12; index += 1) {
    const taskResponse = await request.post(`/api/projects/${project.id}/quality-tasks`, {
      data: { title: `质量任务 ${index + 1}` },
    });
    expect(taskResponse.ok()).toBe(true);
  }

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  const taskChoices = page.locator('#quality-task-list .quality-task-choices');
  await expect(taskChoices.locator('[data-quality-task-select]')).toHaveCount(12);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const scrollStyles = await taskChoices.evaluate((element) => {
      const style = getComputedStyle(element);
      return { maxHeight: style.maxHeight, overflowY: style.overflowY };
    });
    expect(scrollStyles).toEqual({ maxHeight: 'none', overflowY: 'visible' });
    const pageCanScroll = await page.locator('#view-project-detail').evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(pageCanScroll).toBe(true);
  }
});

test('analysis and regression actions stay task-scoped while project-level records keep their actions', async ({ page, request }) => {
  const project = (await (await request.post('/api/projects', { data: { title: `任务操作隔离-${Date.now()}`, createWorkspace: false } })).json()).project;
  const taskA = (await (await request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '隔离任务 A' } })).json()).task;
  const taskB = (await (await request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '隔离任务 B' } })).json()).task;
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.testruns = [{ id: 'run-task-b', qualityTaskId: taskB.id, status: 'failed', resultTrust: 'controlled-local', executor: 'node-test', summary: 'Task B failure' }];
    payload.project.failureAnalyses = [
      { id: 'analysis-task-b', qualityTaskId: taskB.id, testRunId: 'run-task-b', status: 'proposed', version: 1, summary: '任务 B 的分析' },
      { id: 'analysis-project', status: 'proposed', version: 1, summary: '未归属任务的分析' },
    ];
    payload.project.regressionSets = [
      { id: 'regression-task-a', qualityTaskId: taskA.id, name: '任务 A 回归集', status: 'calculated', version: 1, cases: [{ testCaseId: 'case-a', included: true }] },
      { id: 'regression-task-b', qualityTaskId: taskB.id, name: '任务 B 回归集', status: 'calculated', version: 1, cases: [{ testCaseId: 'case-b', included: true }] },
      { id: 'regression-project', name: '项目级回归集', status: 'manual', version: 1, cases: [{ testCaseId: 'case-project', included: true }] },
    ];
    return route.fulfill({ response, json: payload });
  });
  let projectAnalysisPromoted = false;
  await page.route(`**/api/projects/${project.id}/failure-analyses/analysis-project/promote-defect`, async (route) => {
    projectAnalysisPromoted = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, defect: { id: 'defect-from-project-analysis' } }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await page.locator('#project-detail-tabs [data-detail-tab="qualityTasks"]').click();
  await page.locator(`#quality-task-list [data-quality-task-select="${taskA.id}"]`).click();
  const regressionSummary = page.locator('.quality-asset-list [data-asset-kind="regressions"]');
  await expect.soft(regressionSummary).toContainText('任务 A 回归集');
  await expect.soft(regressionSummary).not.toContainText('任务 B 回归集');
  await expect.soft(regressionSummary).not.toContainText('项目级回归集');
  await expect.soft(page.locator('#analysis-add')).toBeDisabled();
  const projectAnalysis = page.locator('#project-quality-records [data-project-analysis-id="analysis-project"]');
  const projectPromotion = projectAnalysis.getByRole('button', { name: '确认并创建缺陷' });
  await expect.soft(projectAnalysis).toContainText('未归属任务的分析');
  await expect.soft(projectPromotion).toBeVisible();
  if (await projectPromotion.count()) {
    await projectPromotion.click();
    await page.locator('#modal-root .modal').locator('input').fill('测试负责人');
    await page.locator('#modal-root .modal').getByRole('button', { name: '确定', exact: true }).click();
    await page.locator('#modal-root .modal').getByRole('button', { name: '登记缺陷', exact: true }).click();
    expect(projectAnalysisPromoted).toBeTruthy();
  }

  const projectRegression = page.locator('#project-quality-records [data-project-regression-id="regression-project"]');
  await expect.soft(projectRegression).toContainText('项目级回归集');
  await expect.soft(projectRegression.getByRole('button', { name: '排除回归项' })).toBeVisible();

  await page.locator(`#quality-task-list [data-quality-task-select="${taskB.id}"]`).click();
  await expect.soft(page.locator('.quality-asset-list [data-asset-kind="analyses"]')).toContainText('任务 B 的分析');
  await expect.soft(page.locator('.quality-asset-list [data-asset-kind="regressions"]')).toContainText('任务 B 回归集');
  await expect.soft(page.locator('.quality-asset-list [data-asset-kind="regressions"]')).not.toContainText('任务 A 回归集');
  await expect.soft(page.locator('#analysis-add')).toBeEnabled();
});

test('a delayed action-queue navigation cannot replace a project opened afterwards', async ({ page, request }) => {
  const projectA = (await (await request.post('/api/projects', { data: { title: `迟到行动项 A-${Date.now()}`, createWorkspace: false } })).json()).project;
  const projectB = (await (await request.post('/api/projects', { data: { title: `迟到行动项 B-${Date.now()}`, createWorkspace: false } })).json()).project;
  const task = (await (await request.post(`/api/projects/${projectA.id}/quality-tasks`, { data: { title: '待确认任务' } })).json()).task;
  const analysis = await request.post(`/api/projects/${projectA.id}/quality-tasks/${task.id}/manual-analyses`, { data: {
    expectedRevision: task.version,
    actorLabel: '测试负责人',
    sourceDigests: [],
    acceptanceCriteria: [],
    risks: [{ id: 'risk-late-navigation', title: '需要负责人确认的风险', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
    testScope: [],
  } });
  expect(analysis.ok()).toBeTruthy();

  let releaseProjectA;
  let signalProjectAStarted;
  const waitForProjectA = new Promise((resolve) => { signalProjectAStarted = resolve; });
  const holdProjectA = new Promise((resolve) => { releaseProjectA = resolve; });
  await page.goto('/');
  const action = page.locator('#dashboard-reminders .action-item').filter({ hasText: projectA.title });
  await expect(action).toBeVisible();
  await page.route(`**/api/projects/${encodeURIComponent(projectA.id)}`, async (route) => {
    if (route.request().method() === 'GET') {
      signalProjectAStarted();
      await holdProjectA;
    }
    return route.continue();
  });
  const projectAResponse = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${projectA.id}`));
  await action.click();
  await waitForProjectA;
  await page.locator('#btn-project-detail-back').click();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectB.title }).click();
  await expect(page.locator('#project-detail-project-title')).toHaveText(projectB.title);
  await expect(page.locator('#project-detail-tabs [data-detail-tab="overview"]')).toHaveClass(/active/);

  releaseProjectA();
  await projectAResponse;
  await expect(page.locator('#project-detail-project-title')).toHaveText(projectB.title);
  await expect(page.locator('#project-detail-tabs [data-detail-tab="overview"]')).toHaveClass(/active/);
});
