import { test, expect } from '../support/e2e-test.js';

async function seededProject(request) {
  const response = await request.get('/api/projects');
  expect(response.ok()).toBe(true);
  const { projects } = await response.json();
  const project = projects.find((item) => item.projectKey === 'PRJ-2026-001');
  expect(project, 'seeded order project').toBeTruthy();
  return project;
}

async function openProjectFromBoard(page, project) {
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await expect(page.locator('#view-project-detail')).toBeVisible();
}

async function patchProjectResponse(page, projectId, update) {
  await page.route(`**/api/projects/${encodeURIComponent(projectId)}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    update(payload.project);
    return route.fulfill({ response, json: payload });
  });
}

function parseColor(value) {
  return value.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function relativeLuminance(rgb) {
  return rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(parseColor(foreground));
  const second = relativeLuminance(parseColor(background));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('quick preview opens the full workspace and return restores the board', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  const card = page.locator('.card').filter({ hasText: project.title });
  await card.getByRole('button', { name: '快速预览' }).click();
  await expect(page.locator('#drawer')).toBeVisible();
  await page.locator('#btn-drawer-full').click();

  await expect(page.locator('#drawer')).toBeHidden();
  await expect(page.locator('#view-project-detail')).toBeVisible();
  await expect(page.locator('#project-detail-tabs').locator('[data-detail-tab]')).toHaveCount(6);
  const detailBounds = await page.locator('.project-detail-page').boundingBox();
  const contentBounds = await page.locator('#main-content').boundingBox();
  expect(detailBounds.x).toBeCloseTo(contentBounds.x, 0);
  expect(detailBounds.y).toBeCloseTo(contentBounds.y, 0);
  expect(detailBounds.width).toBeCloseTo(contentBounds.width, 0);
  expect(detailBounds.height).toBeGreaterThanOrEqual(contentBounds.height);

  await page.getByRole('button', { name: '返回项目看板' }).click();
  await expect(page.locator('#view-board')).toBeVisible();
  await expect(card).toBeVisible();
});

test('returning from project detail restores board and column scroll positions', async ({ page, request }) => {
  const createdProjects = [];
  for (const status of ['intake', 'design']) {
    for (let index = 0; index < 8; index += 1) {
      const response = await request.post('/api/projects', {
        data: { title: `滚动恢复项目-${status}-${Date.now()}-${index}`, createWorkspace: false },
      });
      expect(response.ok()).toBe(true);
      const project = (await response.json()).project;
      if (status === 'design') {
        const transitionResponse = await request.post(`/api/projects/${project.id}/transition`, { data: { to: status } });
        expect(transitionResponse.ok()).toBe(true);
      }
      createdProjects.push(project);
    }
  }

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  const scrollPositions = await page.locator('#board').evaluate((board) => {
    board.scrollLeft = Math.min(48, board.scrollWidth - board.clientWidth);
    const intakeCards = board.querySelector('.col[data-col="intake"] .col-cards');
    const designCards = board.querySelector('.col[data-col="design"] .col-cards');
    intakeCards.scrollTop = Math.min(140, intakeCards.scrollHeight - intakeCards.clientHeight);
    designCards.scrollTop = Math.min(140, designCards.scrollHeight - designCards.clientHeight);
    const visibleCard = [...designCards.querySelectorAll('.card')].find((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardsRect = designCards.getBoundingClientRect();
      return cardRect.top >= cardsRect.top && cardRect.bottom <= cardsRect.bottom;
    });
    return {
      boardLeft: board.scrollLeft,
      columnTops: {
        intake: intakeCards.scrollTop,
        design: designCards.scrollTop,
      },
      projectId: visibleCard?.dataset.id,
    };
  });
  expect(scrollPositions.boardLeft).toBeGreaterThan(0);
  expect(scrollPositions.columnTops.intake).toBeGreaterThan(0);
  expect(scrollPositions.columnTops.design).toBeGreaterThan(0);
  expect(createdProjects.some((project) => project.id === scrollPositions.projectId)).toBe(true);

  await page.locator(`.card[data-id="${scrollPositions.projectId}"]`).click();
  await expect(page.locator('#view-project-detail')).toBeVisible();
  await page.getByRole('button', { name: '返回项目看板' }).click();
  await expect(page.locator('#view-board')).toBeVisible();

  const restoredPositions = await page.locator('#board').evaluate((board) => ({
    boardLeft: board.scrollLeft,
    columnTops: {
      intake: board.querySelector('.col[data-col="intake"] .col-cards').scrollTop,
      design: board.querySelector('.col[data-col="design"] .col-cards').scrollTop,
    },
  }));
  expect(restoredPositions).toEqual({ boardLeft: scrollPositions.boardLeft, columnTops: scrollPositions.columnTops });
});

test('keeps project identity visible across workspace sections', async ({ page, request }) => {
  const project = (await (await request.post('/api/projects', { data: { title: `项目身份-${Date.now()}`, createWorkspace: false } })).json()).project;
  await openProjectFromBoard(page, project);
  await expect(page.locator('#project-detail-project-title')).toHaveText(project.title);
  await page.locator('[data-detail-tab="delivery"]').click();
  await expect(page.locator('#project-detail-project-title')).toHaveText(project.title);
});

test('keeps the header milestone link after a refresh on another section', async ({ page, request }) => {
  const projectTitle = `头部刷新项目-${Date.now()}`;
  const created = await request.post('/api/projects', { data: { title: projectTitle, createWorkspace: false } });
  expect(created.ok()).toBe(true);
  const { project } = await created.json();
  const schedule = await request.post(`/api/projects/${project.id}/schedule`, { data: { type: 'milestone', title: '头部里程碑', date: '2099-03-01', kind: 'release' } });
  expect(schedule.ok()).toBe(true);

  await openProjectFromBoard(page, project);
  const milestoneChip = page.locator('#overview-upcoming-milestone');
  await expect(milestoneChip).toContainText('头部里程碑');
  await page.locator('[data-detail-tab="traceability"]').click();

  const nextKey = `HDR-${Date.now()}`;
  const patched = await request.patch(`/api/projects/${project.id}`, { data: { projectKey: nextKey } });
  expect(patched.ok()).toBe(true);
  await expect(page.locator('#project-detail-meta [data-project-key]')).toHaveText(nextKey);
  await expect(milestoneChip).toContainText('头部里程碑');
  const chipClickable = await milestoneChip.evaluate((element) => Boolean(element.onclick));
  expect(chipClickable).toBe(true);
});

test('failed project load offers retry and hides stale controls', async ({ page, request }) => {
  const first = (await (await request.post('/api/projects', { data: { title: `上一个项目-${Date.now()}`, createWorkspace: false } })).json()).project;
  const second = (await (await request.post('/api/projects', { data: { title: `加载失败项目-${Date.now()}`, createWorkspace: false } })).json()).project;
  await openProjectFromBoard(page, first);
  await expect(page.locator('#ov-title')).toHaveValue(first.title);
  await page.getByRole('button', { name: /返回项目看板/ }).click();

  let failOnce = true;
  await page.route(`**/api/projects/${encodeURIComponent(second.id)}`, async (route) => {
    if (failOnce && route.request().method() === 'GET') {
      failOnce = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary unavailable' }) });
    }
    return route.continue();
  });
  await page.locator('.card').filter({ hasText: second.title }).click();
  await expect(page.locator('#detail-load-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#project-detail-project-title')).toContainText('加载失败');
  await expect(page.locator('#project-detail-tabs [data-detail-tab]')).toHaveCount(0);
  await expect(page.locator('#project-detail-body #ov-title')).toHaveCount(0);
  await expect(page.locator('#btn-project-detail-edit')).toBeDisabled();
  await expect(page.locator('#btn-project-detail-delete')).toBeDisabled();
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.locator('#project-detail-project-title')).toHaveText(second.title);
  await expect(page.locator('#project-detail-body #ov-title')).toHaveValue(second.title);
  await expect(page.locator('#btn-project-detail-edit')).toBeEnabled();
  await expect(page.locator('#btn-project-detail-delete')).toBeEnabled();
});

test('failed project deletion keeps the page open and reports an actionable error', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary delete failure' }) });
    }
    return route.continue();
  });
  await openProjectFromBoard(page, project);
  await page.locator('#project-overview-extra summary').click();
  await page.locator('#ov-delete').click();
  await page.getByRole('button', { name: '删除记录' }).click();
  await expect(page.locator('#toast-root .toast.err')).toContainText('删除项目记录失败：temporary delete failure');
  await expect(page.locator('#view-project-detail')).toBeVisible();
  await expect(page.locator('#project-detail-project-title')).toHaveText(project.title);
});

test('overview displays only project-scoped Action Queue items', async ({ page, request }) => {
  const project = await seededProject(request);
  const response = await request.get(`/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`);
  expect(response.ok()).toBe(true);
  const { items } = await response.json();

  await openProjectFromBoard(page, project);
  const actionList = page.locator('#project-action-queue');
  await expect(actionList).toBeVisible();
  await expect(actionList).toHaveAttribute('data-load-state', 'ready');
  const actualIds = await actionList.locator('[data-action-id]:visible').evaluateAll((nodes) => nodes.map((node) => node.dataset.actionId));
  const expectedVisible = items.filter((item) => item.status !== 'in_progress').slice(0, 5).map((item) => item.id);
  expect(actualIds).toEqual(expectedVisible);
  expect(actualIds.every((id) => items.some((item) => item.id === id && item.projectId === project.id))).toBe(true);

  const remaining = items.filter((item) => item.status !== 'in_progress').length - expectedVisible.length;
  if (remaining > 0) {
    await actionList.getByRole('button', { name: /显示全部/ }).click();
    const expandedIds = await actionList.locator('[data-action-id]:visible').evaluateAll((nodes) => nodes.map((node) => node.dataset.actionId));
    expect(expandedIds).toEqual(items.filter((item) => item.status !== 'in_progress').map((item) => item.id));
  }
  const runningItems = items.filter((item) => item.status === 'in_progress');
  if (runningItems.length) {
    const monitoring = page.locator('#project-action-monitoring');
    const monitoringIds = await monitoring.locator('[data-action-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.actionId));
    expect(monitoringIds).toEqual(runningItems.map((item) => item.id));
  }
});

test('project action items omit repeated project context and need-action status', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  const actionQueue = page.locator('#project-action-queue');
  await expect(actionQueue).toHaveAttribute('data-load-state', 'ready');
  await expect(actionQueue).not.toContainText(project.title);
  const statuses = await actionQueue.locator('.attention-time').allTextContents();
  expect(statuses).not.toContain('待处理');
  await expect(actionQueue.locator('.attention-action').first()).toContainText('需要处理');
});

test('compact action items keep blocked and running status on the first row', async ({ page, request }) => {
  const project = await seededProject(request);
  const items = [
    { id: 'blocked:1', kind: 'workflow', priority: 'high', status: 'blocked', actionRequired: true, projectId: project.id, entityId: 'blocked-entity', projectTitle: project.title, titleKey: 'action.workflow_defects.title', reasonCode: 'workflow_defects', reasonArgs: { count: 1 }, target: { view: 'project-detail', tab: 'qualityTasks', entityId: 'blocked-entity' } },
    { id: 'running:2', kind: 'run_running', priority: 'medium', status: 'in_progress', actionRequired: false, projectId: project.id, entityId: 'running-entity', projectTitle: project.title, titleKey: 'action.run_running.title', reasonCode: 'run_running', reasonArgs: {}, target: { view: 'project-detail', tab: 'qualityTasks', entityId: 'running-entity' } },
  ];
  await page.route('**/api/action-queue?projectId=**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), items }),
  }));
  await openProjectFromBoard(page, project);
  await expect(page.locator('#project-action-queue')).toHaveAttribute('data-load-state', 'ready');

  for (const [id, expectedStatus] of [['blocked:1', '已阻断'], ['running:2', '执行中']]) {
    const item = page.locator(`#project-action-queue [data-action-id="${id}"]`);
    await expect(item).toHaveClass(/has-status/);
    await expect(item.locator('.attention-time')).toHaveText(expectedStatus);
    const layout = await item.evaluate((element) => {
      const itemBox = element.getBoundingClientRect();
      const statusBox = element.querySelector('.attention-time').getBoundingClientRect();
      return {
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        statusTop: Math.round(statusBox.top - itemBox.top),
        statusLeft: Math.round(statusBox.left - itemBox.left),
      };
    });
    expect(layout.columns).toBe(4);
    expect(layout.statusTop).toBeLessThan(35);
    expect(layout.statusLeft).toBeGreaterThan(0);
  }
});

test('overview summarizes project signals and links to filtered source sections', async ({ page, request }) => {
  const project = await seededProject(request);
  const fullProject = (await (await request.get(`/api/projects/${project.id}`)).json()).project;
  const requirementsWithoutCases = fullProject.requirements.filter((requirement) => !(requirement.links || []).some((link) => fullProject.testcases.some((testcase) => testcase.id === link.testcaseId))).length;
  await patchProjectResponse(page, project.id, (p) => {
    p.owner = '林晓';
    p.testcases = [...(p.testcases || []), { id: 'overview-unlinked-case', title: '概况计数用例', status: 'draft' }];
    p.defects = [
      { id: 'closed-first', title: '已关闭问题', status: 'closed', severity: 'minor' },
      { id: 'open-first', title: '待处理问题', status: 'open', severity: 'major' },
      { id: 'verify-second', title: '待验证问题', status: 'verify', severity: 'minor' },
      { id: 'verified-terminal', title: '已验证问题', status: 'verified', severity: 'critical' },
    ];
    p.evidenceBundles = [
      { id: 'verified-bundle', state: 'ready', integrity: 'verified', items: [] },
      { id: 'unverified-bundle', state: 'ready', integrity: 'pending', items: [] },
    ];
    p.gates = [
      { id: 'human-pending', title: '待负责人确认', type: 'release', kind: 'human', status: 'pending' },
      { id: 'computed-gate', title: '自动评估', type: 'quality', kind: 'computed', status: 'pending', verdict: 'BLOCK', calculatedAt: '2099-02-01T00:00:00.000Z' },
    ];
    p.testruns = [{ id: 'older-passing-run', status: 'passed', updatedAt: '2099-01-01T00:00:00.000Z' }];
    p.milestones = [
      { id: 'later-milestone', title: '后续发布', kind: 'release', dueDate: '2099-10-01', done: false },
      { id: 'nearest-milestone', title: '最近评审', kind: 'review', dueDate: '2099-02-01', done: false },
      { id: 'completed-milestone', title: '已完成节点', kind: 'review', dueDate: '2099-01-01', done: true },
    ];
  });
  await openProjectFromBoard(page, project);

  const actionQueuePrecedesMetrics = await page.locator('#project-detail-body').evaluate((body) => {
    const queue = body.querySelector('#project-action-queue');
    const metrics = body.querySelector('.overview-metrics');
    return Boolean(queue && metrics && (queue.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(actionQueuePrecedesMetrics).toBe(true);

  await expect(page.locator('[data-overview-metric="requirements"]')).toContainText(String(fullProject.requirements.length));
  await expect(page.locator('[data-overview-metric="testcases"]')).toContainText(String(fullProject.testcases.length + 1));
  await expect(page.locator('[data-overview-metric="testcases"]')).toContainText('未关联需求');
  await expect(page.locator('[data-overview-metric="open-defects"]')).toContainText('2');
  await expect(page.locator('[data-overview-metric="verified-evidence"]')).toContainText('1');
  await expect(page.locator('[data-overview-metric="pending-gates"]')).toContainText('1');
  const latestQualitySignal = page.locator('#overview-latest-quality-signal');
  await expect(latestQualitySignal).toContainText('BLOCK');
  await expect(latestQualitySignal).toHaveAttribute('data-overview-target', 'delivery');
  await expect(latestQualitySignal).toHaveAttribute('data-overview-scroll-target', '#quality-gate-summary');
  await expect(page.locator('#overview-upcoming-milestone')).toContainText('最近评审');

  await page.locator('[data-detail-tab="defectsRisks"]').click();
  const defectIds = await page.locator('#defect-records [data-defect-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.defectId));
  expect(defectIds[0]).toBe('open-first');
  expect(defectIds).toEqual(['open-first', 'verify-second', 'closed-first', 'verified-terminal']);
  await expect(page.locator('[data-defect-id="verified-terminal"] .status-select')).toHaveValue('verified');
  await expect(page.locator('[data-defect-id="verified-terminal"] .status-select')).toHaveAccessibleName('已验证问题 的状态');

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-overview-metric="requirements"]').click();
  await expect(page.locator('[data-detail-tab="traceability"]')).toHaveClass(/active/);
  await expect(page.locator('#coverage-filter')).toHaveValue('no-linked-cases');
  await expect(page.locator('#requirement-matrix .requirement-row')).toHaveCount(requirementsWithoutCases);

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-overview-metric="testcases"]').click();
  await expect(page.locator('[data-detail-tab="traceability"]')).toHaveClass(/active/);
  await expect(page.locator('#coverage-filter')).toHaveValue('all');
  await expect(page.locator('#requirement-matrix')).toBeInViewport();

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-overview-metric="open-defects"]').click();
  await expect(page.locator('[data-detail-tab="defectsRisks"]')).toHaveClass(/active/);
  await expect(page.locator('#defect-status-filter')).toHaveValue('open');
  await expect(page.locator('#defect-records [data-defect-id]')).toHaveCount(2);
  await page.locator('#defect-status-filter').selectOption('closed');
  await expect(page.locator('#defect-records [data-defect-id]')).toHaveCount(2);
  await expect(page.locator('#defect-records [data-defect-id="verified-terminal"]')).toBeVisible();

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-overview-metric="verified-evidence"]').click();
  await expect(page.locator('[data-detail-tab="delivery"]')).toHaveClass(/active/);
  await expect(page.locator('#delivery-evidence-list [data-evidence-bundle-id]')).toHaveCount(1);
  await expect(page.locator('#delivery-evidence-list [data-evidence-bundle-id="verified-bundle"]')).toBeVisible();

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-overview-metric="pending-gates"]').click();
  await expect(page.locator('#detail-delivery-gates [data-gate-id]')).toHaveCount(1);
  await expect(page.locator('#detail-delivery-gates [data-gate-id="human-pending"]')).toBeVisible();
  await expect(page.locator('#detail-delivery-gates [data-gate-id="computed-gate"]')).toHaveCount(0);
});

test('overview reflects the project-level gate verdict and quality signal', async ({ page, request }) => {
  const projectTitle = `项目门禁投影-${Date.now()}`;
  const created = await request.post('/api/projects', { data: { title: projectTitle, createWorkspace: false } });
  expect(created.ok()).toBe(true);
  const { project } = await created.json();
  const taskCreated = await request.post(`/api/projects/${project.id}/quality-tasks`, { data: { title: '支付回调风险任务' } });
  expect(taskCreated.ok()).toBe(true);
  const { task } = await taskCreated.json();
  const analysis = await request.post(`/api/projects/${project.id}/quality-tasks/${task.id}/manual-analyses`, { data: {
    expectedRevision: task.version,
    actorLabel: '测试负责人',
    sourceDigests: [],
    acceptanceCriteria: [{ id: 'gate-acceptance', condition: '验签失败的支付回调必须拒绝处理' }],
    risks: [{ id: 'gate-risk', title: '回调可能未验签', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
    testScope: [{ id: 'gate-scope', title: '支付回调接口' }],
  } });
  expect(analysis.ok()).toBe(true);

  await openProjectFromBoard(page, project);
  await expect(page.locator('.delivery-overview-main')).toContainText('项目级阻断');
  await expect(page.locator('.delivery-overview-main')).toContainText('存在未关闭高风险');
  await expect(page.locator('#overview-latest-quality-signal')).toContainText('BLOCK');
});

test('keeps a stored task gate signal when the project gate passes', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.gates = [{ id: 'task-gate-block', kind: 'computed', qualityTaskId: 'task-gate', verdict: 'BLOCK', calculatedAt: '2099-01-01T00:00:00.000Z', updatedAt: '2099-01-01T00:00:00.000Z' }];
  });
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}/quality-gate`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, gate: { status: 'passed', blockers: [], evaluatedAt: '2099-02-01T00:00:00.000Z' } }),
  }));
  const gateResponse = page.waitForResponse((response) => response.url().includes(`/api/projects/${encodeURIComponent(project.id)}/quality-gate`) && response.status() === 200);
  await openProjectFromBoard(page, project);
  await gateResponse;

  const signal = page.locator('#overview-latest-quality-signal');
  await expect(signal).toContainText('BLOCK');
  await expect(page.locator('.delivery-overview-main')).toContainText('项目级通过');
});

test('overview coverage rows open the matching requirement in the matrix', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  const coverageRow = page.locator('.overview-coverage-panel .coverage-mini').filter({ hasText: '订单创建（含幂等）' });
  await coverageRow.click();
  await expect(page.locator('[data-detail-tab="traceability"]')).toHaveClass(/active/);
  const requirement = page.locator('.requirement-row').filter({ hasText: '订单创建（含幂等）' });
  await expect(requirement.locator('[data-requirement-expand]')).toHaveAttribute('aria-expanded', 'true');
  await expect(requirement).toBeInViewport();
});

test('defect details stay collapsed until expanded inline', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.defects = [{
      id: 'defect-expandable',
      title: '登录状态丢失',
      status: 'open',
      severity: 'major',
      environment: 'Safari 18',
      impact: '用户需要重新登录',
      steps: '在新标签页刷新页面',
      expected: '保持已登录状态',
      actual: '跳转至登录页',
      evidenceRefs: ['expandable-evidence'],
    }];
    p.evidenceBundles = [{ id: 'expandable-evidence', state: 'ready', integrity: 'verified', items: [] }];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="defectsRisks"]').click();

  const defect = page.locator('[data-defect-id="defect-expandable"]');
  const details = defect.locator('[data-defect-details]');
  await expect(defect).toContainText('登录状态丢失');
  await expect(defect).toContainText('Safari 18');
  await expect(defect).toContainText('用户需要重新登录');
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('.defect-details-content')).toBeHidden();

  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.defect-details-content')).toBeVisible();
  await expect(defect).toContainText('在新标签页刷新页面');
  await expect(defect).toContainText('保持已登录状态');
  await expect(defect).toContainText('跳转至登录页');
  await expect(defect.locator('[data-open-defect-evidence="expandable-evidence"]')).toBeVisible();

  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('.defect-details-content')).toBeHidden();
});

test('traceability empty results show active conditions and can be cleared', async ({ page, request }) => {
  const project = await seededProject(request);
  const fullProject = (await (await request.get(`/api/projects/${project.id}`)).json()).project;
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  await page.locator('#requirement-search').fill('不存在的需求');
  await page.locator('#coverage-filter').selectOption('reviewed');

  const empty = page.locator('#requirement-empty-filter');
  await expect(empty).toContainText('不存在的需求');
  await expect(empty).toContainText('已评审覆盖');
  await empty.getByRole('button', { name: '清除搜索和筛选' }).click();
  await expect(page.locator('#requirement-search')).toHaveValue('');
  await expect(page.locator('#coverage-filter')).toHaveValue('all');
  await expect(page.locator('#requirement-matrix .requirement-row')).toHaveCount(fullProject.requirements.length);
});

test('failed testcase status updates restore the server value', async ({ page, request }) => {
  const project = await seededProject(request);
  const { project: fullProject } = await (await request.get(`/api/projects/${project.id}`)).json();
  const requirement = fullProject.requirements.find((item) => item.links?.some((link) => fullProject.testcases.some((testcase) => testcase.id === link.testcaseId)));
  const testcase = fullProject.testcases.find((item) => requirement.links.some((link) => link.testcaseId === item.id));
  const nextStatus = testcase.status === 'reviewed' ? 'draft' : 'reviewed';
  const statusEndpoint = `**/api/projects/${encodeURIComponent(project.id)}/testcases/${encodeURIComponent(testcase.id)}/status`;
  await page.route(statusEndpoint, (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'temporary status failure' }) })
    : route.continue());
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  await page.locator(`[data-requirement-id="${requirement.id}"] [data-requirement-expand]`).click();
  const testcaseCard = page.locator(`[data-linked-testcase-id="${testcase.id}"]`).first();
  await testcaseCard.locator('[data-testcase-expand]').click();
  const statusSelect = testcaseCard.locator('[data-testcase-id][data-testcase-status]');
  await statusSelect.selectOption(nextStatus);
  await expect(statusSelect).toHaveValue(testcase.status);
  const { project: unchanged } = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(unchanged.testcases.find((item) => item.id === testcase.id).status).toBe(testcase.status);
});

test('expanded testcase links to the project run summary', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.testruns = [{ id: 'project-run-summary-item', status: 'passed', executor: 'node-test', summary: '订单回归执行摘要', createdAt: '2026-11-15T08:00:00.000Z' }];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const requirement = page.locator('#requirement-matrix .requirement-row').first();
  await requirement.locator('[data-requirement-expand]').click();
  const linkedCase = page.locator('.requirement-detail-row [data-linked-testcase-id]').first();
  await linkedCase.locator('[data-testcase-expand]').click();
  await expect(linkedCase).toContainText('暂无逐用例执行结果');
  await linkedCase.getByRole('button', { name: '查看项目运行汇总' }).click();

  await expect(page.locator('[data-detail-tab="qualityTasks"]')).toHaveClass(/active/);
  const runSummary = page.locator('#project-run-summary');
  await expect(runSummary).toBeVisible();
  await expect(runSummary).toContainText('订单回归执行摘要');
  await expect(runSummary).toBeInViewport();
});

test('loading keeps project identity visible and mobile actions and section navigation remain usable', async ({ page, request }) => {
  const project = (await (await request.post('/api/projects', { data: { title: `加载识别-${Date.now()}`, createWorkspace: false } })).json()).project;
  let releaseProjectRequest;
  const holdProjectRequest = new Promise((resolve) => { releaseProjectRequest = resolve; });
  let interceptedProjectRequest = false;
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    interceptedProjectRequest = true;
    await holdProjectRequest;
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.owner = '移动端负责人周宁';
    return route.fulfill({ response, json: payload });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await expect.poll(() => interceptedProjectRequest).toBe(true);
  await expect(page.locator('#project-detail-project-title')).toHaveText(project.title);
  await expect(page.locator('#project-detail-body')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#detail-loading-skeleton')).toBeVisible();
  releaseProjectRequest();
  await expect(page.locator('#project-detail-project-title')).toHaveText(project.title);
  await expect(page.locator('#project-detail-meta [data-project-owner]')).toHaveText('测试负责人：移动端负责人周宁');

  await page.setViewportSize({ width: 390, height: 640 });
  const moreActions = page.locator('#project-detail-more');
  await expect(moreActions).toBeVisible();
  await expect(moreActions.locator('summary')).toHaveAccessibleName('更多操作');
  await moreActions.locator('summary').click();
  await expect(page.locator('#btn-project-detail-chat')).toBeVisible();
  await expect(page.locator('#btn-project-detail-folder')).toBeVisible();
  await moreActions.locator('summary').click();

  const tabs = page.locator('#project-detail-tabs');
  const navigation = await tabs.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(navigation.scrollWidth).toBeGreaterThan(navigation.clientWidth);
  await tabs.locator('[data-detail-tab="delivery"]').scrollIntoViewIfNeeded();
  await tabs.locator('[data-detail-tab="delivery"]').click();
  const selectedTab = tabs.locator('[data-detail-tab="delivery"]');
  await expect(selectedTab).toHaveClass(/active/);
  const selectedTabIsVisible = await selectedTab.evaluate((tab) => {
    const nav = tab.parentElement.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    return item.left >= nav.left && item.right <= nav.right;
  });
  expect(selectedTabIsVisible).toBe(true);
});

test('legacy action targets map to the corresponding workspace sections', async ({ page, request }) => {
  const project = await seededProject(request);
  const legacyTargets = [
    ['overview', 'overview'],
    ['qualityTasks', 'qualityTasks'],
    ['milestones', 'activity'],
    ['gates', 'delivery'],
  ];
  await page.route(`**/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const source = payload.items[0];
    const legacyItems = legacyTargets.map(([tab]) => ({
      ...source,
      id: `legacy-${tab}`,
      target: { view: 'project-detail', tab, entityId: `entity-${tab}` },
    }));
    legacyItems.push({
      ...source,
      id: 'legacy-workflow',
      kind: 'workflow',
      target: { view: 'assistant', tab: null, entityId: project.id },
    });
    await route.fulfill({ response, json: { ...payload, items: [...legacyItems, ...payload.items] } });
  });

  await openProjectFromBoard(page, project);
  await expect(page.locator('#project-action-queue')).toHaveAttribute('data-load-state', 'ready');
  for (const [legacyTab, workspaceTab] of legacyTargets) {
    const item = page.locator(`#project-action-queue [data-action-id="legacy-${legacyTab}"]`);
    if (!await item.isVisible()) await page.locator('.overview-other-actions > summary').click();
    await item.click();
    await expect(page.locator(`[data-detail-tab="${workspaceTab}"].active`)).toBeVisible();
    if (legacyTab !== 'overview') await page.locator('[data-detail-tab="overview"]').click();
  }

  const workflowItem = page.locator('#project-action-queue [data-action-id="legacy-workflow"]');
  if (!await workflowItem.isVisible()) await page.locator('.overview-other-actions > summary').click();
  await workflowItem.click();
  await expect(page.locator('#view-assistant')).toBeVisible();
});

test('expands linked cases from seeded requirements', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();

  const matrix = page.locator('#requirement-matrix');
  const requirement = matrix.locator('.requirement-row').filter({ hasText: '订单创建（含幂等）' });
  await expect(requirement).toContainText('同一请求重复提交只生成一个订单');
  await expect(requirement).toHaveAttribute('data-coverage-state', 'review-pending');
  const requirementToggle = requirement.locator('[data-requirement-expand]');
  const detailsId = await requirementToggle.getAttribute('aria-controls');
  await requirementToggle.click();
  const linkedCase = page.locator(`#${detailsId} [data-linked-testcase-id]`).filter({ hasText: '正常提交订单生成订单号' });
  await expect(linkedCase).toContainText('验证正常下单主流程');
  const idempotencyCase = page.locator(`#${detailsId} [data-linked-testcase-id]`).filter({ hasText: '重复提交幂等校验' });
  await expect(idempotencyCase).toContainText('验证幂等覆盖');
  await linkedCase.locator('[data-testcase-expand]').click();
  await expect(linkedCase).toContainText('已登录，商品有库存');
  await expect(linkedCase).toContainText('查看订单列表');
  await expect(linkedCase).toContainText('生成唯一订单号，状态为待支付');

  const status = linkedCase.locator('[data-testcase-status]');
  await status.selectOption('reviewed');
  await expect(linkedCase).toBeVisible();
  await expect(status).toHaveValue('reviewed');
  await status.selectOption('draft');
});

test('expanded requirement cases keep the full row width on desktop', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const requirement = page.locator('#requirement-matrix .requirement-row').filter({ hasText: '订单创建（含幂等）' });
  await requirement.locator('[data-requirement-expand]').click();
  const details = page.locator('.requirement-detail-row:not([hidden])');

  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await details.evaluate((row) => {
      const tableWidth = row.closest('table').getBoundingClientRect().width;
      const cellWidth = row.querySelector('td').getBoundingClientRect().width;
      const cardWidth = row.querySelector('.traceability-case').getBoundingClientRect().width;
      return { tableWidth, cellWidth, cardWidth };
    });
    expect(sizes.cellWidth).toBeGreaterThanOrEqual(sizes.tableWidth - 2);
    expect(sizes.cardWidth).toBeGreaterThan(300);
  }
});

test('overview stacks at tablet widths without clipping the coverage panel', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);

  for (const width of [1024, 820, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('.overview-main-grid');
      const metrics = document.querySelector('.overview-metrics');
      const row = document.querySelector('.coverage-mini');
      const title = document.querySelector('.overview-coverage-panel h3');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        metricColumns: getComputedStyle(metrics).gridTemplateColumns.split(' ').length,
        clipped: row.scrollWidth > row.clientWidth,
        titleWidth: title.getBoundingClientRect().width,
        titleHeight: title.getBoundingClientRect().height,
      };
    });
    expect(layout.columns).toBe(1);
    expect(layout.metricColumns).toBe(2);
    expect(layout.clipped).toBe(false);
    expect(layout.titleWidth).toBeGreaterThan(120);
    expect(layout.titleHeight).toBeLessThan(30);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.overview-main-grid')).gridTemplateColumns.split(' ').length,
    metricColumns: getComputedStyle(document.querySelector('.overview-metrics')).gridTemplateColumns.split(' ').length,
  }));
  expect(desktop).toEqual({ columns: 2, metricColumns: 4 });
});

test('dark theme keeps the project primary action readable', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.addInitScript(() => localStorage.setItem('dsh-qa-theme', 'dark'));
  await openProjectFromBoard(page, project);
  const colors = await page.locator('#btn-project-detail-chat').evaluate((element) => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }));
  expect(contrastRatio(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5);
});

test('keeps the project detail usable at 1440, 1024, 768, and 390 pixels', async ({ page, request }) => {
  const project = await seededProject(request);
  const longAcceptance = `${'支付回调签名必须通过密钥校验，重复请求不能创建第二条支付记录。'.repeat(20)}尾部验收标记`;
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.requirements[0].acceptance = longAcceptance;
    return route.fulfill({ response, json: payload });
  });
  await openProjectFromBoard(page, project);

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 640 : 900 });
    const viewport = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(Math.max(viewport.documentWidth, viewport.bodyWidth)).toBeLessThanOrEqual(viewport.viewportWidth);

    const shell = page.locator('.project-detail-page');
    const shellStyle = await shell.evaluate((element) => ({
      borderRadius: getComputedStyle(element).borderRadius,
      margin: getComputedStyle(element).margin,
      boxShadow: getComputedStyle(element).boxShadow,
    }));
    expect(shellStyle).toEqual({ borderRadius: '0px', margin: '0px', boxShadow: 'none' });

    const tabs = page.locator('#project-detail-tabs');
    await expect(tabs.locator('[data-detail-tab]')).toHaveCount(6);
    const traceabilityTab = tabs.locator('[data-detail-tab="traceability"]');
    await traceabilityTab.scrollIntoViewIfNeeded();
    await traceabilityTab.click();
    const matrix = page.locator('#requirement-matrix');
    const acceptance = matrix.locator('.requirement-acceptance p').first();
    await expect(acceptance).toContainText('尾部验收标记');
    const textLayout = await acceptance.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(textLayout.scrollWidth).toBeLessThanOrEqual(textLayout.width);
    expect(textLayout.height).toBeGreaterThan(textLayout.lineHeight * 2);

    if (width === 390) {
      const navigation = await tabs.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      expect(navigation.scrollWidth).toBeGreaterThan(navigation.clientWidth);
      await tabs.locator('[data-detail-tab="delivery"]').scrollIntoViewIfNeeded();
      await tabs.locator('[data-detail-tab="delivery"]').click();
      await expect(page.locator('[data-detail-tab="delivery"]')).toHaveClass(/active/);
      await tabs.locator('[data-detail-tab="overview"]').scrollIntoViewIfNeeded();
      await tabs.locator('[data-detail-tab="overview"]').click();
      await page.locator('#project-detail-more summary').click();
      await page.getByRole('button', { name: '编辑项目' }).click();
      const save = page.locator('#ov-save');
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
    }
  }
});

test('keeps keyboard focus visible while expanding a requirement', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const requirement = page.locator('#requirement-matrix .requirement-row').first();
  const toggle = requirement.locator('[data-requirement-expand]');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-label', /收起需求/);
  const focusState = await page.evaluate(() => ({
    focused: document.activeElement === document.querySelector('[data-requirement-expand]'),
    keyboardVisible: document.activeElement?.matches(':focus-visible') || false,
    outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
  }));
  expect(focusState.focused).toBe(true);
  expect(focusState.keyboardVisible).toBe(true);
  expect(focusState.outlineStyle).not.toBe('none');
});

test('filters requirements by text and coverage', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const matrix = page.locator('#requirement-matrix');

  await page.locator('#requirement-search').fill('支付回调');
  await expect(matrix.locator('.requirement-row')).toHaveCount(1);
  await expect(matrix.locator('.requirement-row').first()).toContainText('支付回调处理');

  await page.locator('#requirement-search').fill('');
  await page.locator('#coverage-filter').selectOption('uncovered');
  await expect(matrix.locator('.requirement-row')).toHaveCount(1);
  await expect(matrix.locator('.requirement-row').first()).toContainText('库存并发扣减');

  await page.locator('#coverage-filter').selectOption('review-pending');
  await expect(matrix.locator('.requirement-row')).toHaveCount(2);
  await page.locator('#coverage-filter').selectOption('reviewed');
  await expect(matrix.locator('.requirement-row')).toHaveCount(0);
  await expect(page.locator('#requirement-empty-filter')).toBeVisible();
});

test('desktop traceability table keeps its header attached to the page scroll', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await patchProjectResponse(page, project.id, (p) => {
    p.requirements.push(...Array.from({ length: 12 }, (_, index) => ({
      id: `req-sticky-${index}`,
      title: `Sticky header requirement ${index + 1}`,
      statement: 'This additional requirement makes the page tall enough to verify the shared scroll area.',
      acceptance: 'Keep the requirement visible while scrolling.',
      kind: 'functional',
      links: [],
    })));
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const table = page.locator('.traceability-table-wrap');
  const scrollArea = page.locator('#view-project-detail');
  const tableState = await table.evaluate((element) => ({
    maxHeight: getComputedStyle(element).maxHeight,
    overflowY: getComputedStyle(element).overflowY,
    headerPosition: getComputedStyle(element.querySelector('th')).position,
  }));
  expect(tableState.maxHeight).toBe('none');
  expect(tableState.overflowY).toBe('visible');
  expect(tableState.headerPosition).toBe('sticky');
  const scrollHeight = await scrollArea.evaluate((element) => element.scrollHeight);
  const clientHeight = await scrollArea.evaluate((element) => element.clientHeight);
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  await scrollArea.evaluate((element) => { element.scrollTop = 700; });
  const headerTop = await table.locator('th').first().evaluate((element) => element.getBoundingClientRect().top);
  const scrollAreaTop = await scrollArea.evaluate((element) => element.getBoundingClientRect().top);
  expect(Math.abs(headerTop - scrollAreaTop)).toBeLessThanOrEqual(3);
});

test('shows unlinked cases separately', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();

  const unlinked = page.locator('#unlinked-testcases');
  await expect(unlinked).toBeVisible();
  await expect(unlinked).toContainText('库存并发压测不超卖');
  await expect(unlinked.locator('[data-unlinked-testcase-id]')).toHaveCount(1);
});

test('delivery reports and approvals remain usable and defect status is editable', async ({ page, request }) => {
  const project = await seededProject(request);
  const { project: fullProject } = await (await request.get(`/api/projects/${project.id}`)).json();
  const gateId = fullProject.gates.find((gate) => gate.status === 'pending').id;
  const defectId = fullProject.defects[0].id;
  await openProjectFromBoard(page, project);

  await page.locator('[data-detail-tab="delivery"]').click();
  const report = page.locator('#detail-delivery-reports .list-item').filter({ hasText: '电商中台订单服务测试计划' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: '查看最新版本' }).click();
  await expect(report.locator('.doc-view')).toContainText('订单创建、支付回调');
  const approval = page.locator(`#detail-delivery-gates [data-gate-id="${gateId}"]`);
  await expect(approval).toContainText('待负责人审批');
  await approval.getByRole('button', { name: '通过' }).click();
  await expect(page.locator('#modal-root .modal')).toBeVisible();
  await page.locator('#modal-root .modal').getByRole('button', { name: '确认通过' }).click();
  await expect.poll(async () => {
    const { project: updated } = await (await request.get(`/api/projects/${project.id}`)).json();
    return updated.gates.find((gate) => gate.id === gateId).status;
  }).toBe('approved');

  await page.locator('[data-detail-tab="defectsRisks"]').click();
  const defect = page.locator('#defect-records .list-item').filter({ hasText: '退款接口在并发场景偶发返回 500' });
  await expect(defect).toBeVisible();
  const statusEndpoint = `**/api/projects/${encodeURIComponent(project.id)}/defects/${encodeURIComponent(defectId)}/status`;
  await page.route(statusEndpoint, (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'temporary status failure' }) })
    : route.continue());
  await defect.locator('select.status-select').selectOption('closed');
  await expect(defect.locator('select.status-select')).toHaveValue(fullProject.defects.find((item) => item.id === defectId).status);
  await page.unroute(statusEndpoint);
  await defect.locator('select.status-select').selectOption('fixing');
  await expect.poll(async () => {
    const { project: updated } = await (await request.get(`/api/projects/${project.id}`)).json();
    return updated.defects.find((item) => item.id === defectId).status;
  }).toBe('fixing');
});

test('activity sorts recent materials and stage changes while separating schedule, knowledge, and minutes', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="activity"]').click();

  await expect(page.locator('#detail-activity-schedule')).toContainText('用例评审会');
  await expect(page.locator('#detail-activity-schedule')).toContainText('测试排期同步会');
  await expect(page.locator('#detail-activity-schedule')).toContainText('会议');
  await expect(page.locator('#detail-activity-recent')).toContainText('最近活动');
  await expect(page.locator('#detail-activity-recent')).toContainText('测试计划草稿 v1 已保存');
  await expect(page.locator('#detail-activity-recent')).toContainText('用例设计');
  await expect(page.locator('#detail-activity-knowledge')).toContainText('幂等键设计最佳实践');
  await expect(page.locator('#detail-activity-minutes')).toContainText('测试范围确认会纪要');
});

test('retains past events and completed milestones in the activity archive', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.events = [
      { id: 'event-past', title: '已结束联调会', kind: 'meeting', date: '2001-01-01' },
      { id: 'event-future', title: '待进行联调会', kind: 'meeting', date: '2099-01-01' },
    ];
    payload.project.milestones = [
      { id: 'milestone-done', title: '已完成验收', kind: 'release', dueDate: '2001-01-02', done: true },
      { id: 'milestone-open', title: '待完成发布', kind: 'release', dueDate: '2099-01-02', done: false },
    ];
    return route.fulfill({ response, json: payload });
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="activity"]').click();
  await expect(page.locator('#detail-activity-schedule')).toContainText('待进行联调会');
  await expect(page.locator('#detail-activity-schedule')).toContainText('待完成发布');
  await expect(page.locator('#detail-activity-schedule')).toContainText('会议');
  await expect(page.locator('#detail-activity-schedule')).not.toContainText('已结束联调会');
  await expect(page.locator('#detail-activity-past-schedule')).toContainText('已结束联调会');
  await expect(page.locator('#detail-activity-past-schedule')).toContainText('已完成验收');
  await expect(page.locator('#detail-activity-past-schedule')).toContainText('会议');
});

test('recent activity sorts project materials and stage changes by timestamp', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.materials = [
      { id: 'material-new', label: '较新材料', type: 'document', ts: '2026-11-18T10:00:00.000Z' },
      { id: 'material-old', label: '较旧材料', type: 'document', ts: '2026-11-14T10:00:00.000Z' },
    ];
    p.history = [
      { from: 'intake', to: 'design', by: 'QA', at: '2026-11-17T10:00:00.000Z' },
      { from: 'design', to: 'intake', by: 'QA', at: '2026-11-13T10:00:00.000Z' },
    ];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="activity"]').click();

  await expect(page.locator('#detail-activity-recent .timeline-row b')).toHaveText([
    '较新材料',
    '需求分析 → 用例设计',
    '较旧材料',
    '用例设计 → 需求分析',
  ]);
});

test('empty records and first-load or stale Action Queue failures stay distinct', async ({ page, request }) => {
  const projectResponse = await request.post('/api/projects', { data: { title: `空状态项目-${Date.now()}`, createWorkspace: false } });
  const { project } = await projectResponse.json();
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.project.materials = [];
    payload.project.history = [];
    return route.fulfill({ response, json: payload });
  });
  let failActionQueue = true;
  const queueRoute = `**/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`;
  await page.route(queueRoute, async (route) => {
    if (failActionQueue) return route.fulfill({ status: 503, body: 'unavailable' });
    const response = await route.fetch();
    const payload = await response.json();
    return route.fulfill({ response, json: { ...payload, items: [] } });
  });
  await openProjectFromBoard(page, project);
  const actionQueue = page.locator('#project-action-queue');
  await expect(actionQueue).toHaveAttribute('data-load-state', 'error');
  await expect(actionQueue.locator('.action-queue-error')).toHaveAttribute('role', 'alert');

  failActionQueue = false;
  await page.getByRole('button', { name: '返回项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await expect(actionQueue).toHaveAttribute('data-load-state', 'ready');
  failActionQueue = true;
  await page.getByRole('button', { name: '编辑项目' }).click();
  await page.locator('#ov-save').click();
  await expect(actionQueue).toContainText('上次成功读取');
  await expect(actionQueue).toContainText('上次成功结果没有待处理事项，刷新失败，当前状态未知。');
  await expect(actionQueue).not.toContainText('当前没有需要处理的项目行动');

  await page.locator('[data-detail-tab="defectsRisks"]').click();
  await expect(page.locator('#defect-records')).toContainText('暂无缺陷记录');
  await expect(page.locator('#quality-risk-records')).toContainText('暂无质量风险');
  await page.locator('[data-detail-tab="delivery"]').click();
  await expect(page.locator('#detail-delivery-gates')).toContainText('暂无质量门禁记录');
  await expect(page.locator('#detail-delivery-reports')).toContainText('暂无报告记录');
  await expect(page.locator('#detail-delivery-evidence')).toContainText('暂无证据包');
  await page.locator('[data-detail-tab="activity"]').click();
  await expect(page.locator('#detail-activity-schedule')).toContainText('暂无待安排日程');
  await expect(page.locator('#detail-activity-recent')).toContainText('暂无最近活动');
  await expect(page.locator('#detail-activity-knowledge')).toContainText('暂无测试知识沉淀');
  await expect(page.locator('#detail-activity-minutes')).toContainText('暂无会议或讨论纪要');
});

test('language changes preserve project, task, and defect-authored text', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.title = '支付项目状态';
    p.status = 'design';
    p.history = [{ from: 'intake', to: 'design', by: 'seed', at: '2026-11-15T08:00:00.000Z' }];
    p.summary = '通过';
    p.members = [{ id: 'member-locale', name: '林娜', role: 'qa', contact: 'ina@example.test' }];
    p.workspacePath = '/tmp/project-locale';
    p.qualityTasks = [{ id: 'task-locale', title: '支付任务状态', stage: 'intake', risks: [], testScope: ['通过'], acceptanceCriteria: ['通过'], sources: [], decisions: [] }];
    p.testruns = [{ id: 'run-locale', status: 'failed', resultTrust: 'controlled-local', qualityTaskId: 'task-locale', summary: '人工录入的失败摘要' }];
    p.defects = [{ id: 'defect-locale', title: '交易项目状态异常', steps: '项目状态的实际复现描述', status: 'open', severity: 'major' }];
    p.gates = [{ id: 'gate-locale', title: '项目详情', summary: '通过', type: 'release', kind: 'human', status: 'pending' }];
  });
  await openProjectFromBoard(page, project);
  await expect(page.locator('#project-detail-project-title')).toHaveText('支付项目状态');
  await page.locator('#btn-project-detail-settings').click();
  await page.locator('[data-settings-lang="en"]').click();
  await page.locator('#st-close').click();

  await expect(page.locator('#project-detail-project-title')).toHaveText('支付项目状态');
  await expect(page.locator('#project-detail-status')).toHaveText('Test Design');
  await page.locator('[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('.quality-task-title h3')).toHaveText('支付任务状态');
  await expect(page.locator('.quality-task-fields .quality-detail-list li').first()).toHaveText('通过');
  await page.locator('#analysis-add').click();
  await expect(page.getByRole('dialog')).toContainText('Summarize the failure observed in this run.');
  await expect(page.getByLabel('Failure summary')).toBeVisible();
  await page.locator('[data-input-cancel]').click();
  await page.locator('#reg-add').click();
  await expect(page.getByRole('dialog')).toContainText('Give this regression set a recognizable name.');
  await expect(page.getByLabel('Regression set name')).toBeVisible();
  await page.locator('[data-input-cancel]').click();
  await page.getByRole('button', { name: 'New quality task' }).click();
  await expect(page.getByRole('dialog').locator('h3')).toHaveText('New quality task');
  await expect(page.getByLabel('Task name')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('[data-detail-tab="activity"]').click();
  await expect(page.locator('#detail-activity-recent')).toContainText('Requirements → Test Design');
  await page.locator('[data-detail-tab="defectsRisks"]').click();
  await expect(page.locator('[data-defect-id="defect-locale"]')).toContainText('交易项目状态异常');
  await page.locator('[data-defect-id="defect-locale"] [data-defect-details] > summary').click();
  await expect(page.locator('[data-defect-id="defect-locale"]')).toContainText('项目状态的实际复现描述');
  await page.locator('[data-detail-tab="delivery"]').click();
  await expect(page.locator('[data-gate-id="gate-locale"]')).toContainText('项目详情');
  await expect(page.locator('[data-gate-id="gate-locale"]')).toContainText('通过');
  await expect(page.locator('[data-gate-id="gate-locale"]')).toContainText('Awaiting owner approval');
  await expect(page.locator('[data-gate-id="gate-locale"]')).toContainText('Release gate');
  await expect(page.locator('[data-gate-id="gate-locale"]').getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(page.locator('#project-detail-tabs .tab-icon svg')).toHaveCount(6);

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('#project-overview-extra summary').click();
  await expect(page.locator('#project-overview-extra .case-info-card h3')).toHaveText('Project information');
  await expect(page.locator('#ov-summary')).toHaveValue('通过');
  await expect(page.locator('#project-overview-extra .party-row b')).toHaveText('林娜');
  await expect(page.locator('#project-overview-extra .party-row div > span')).toContainText('QA');
  await expect(page.locator('#project-overview-extra .workspace-card h3')).toHaveText('Project workspace');
  await expect(page.locator('#project-overview-extra .workspace-card p')).toHaveText('/tmp/project-locale');
  await page.getByRole('button', { name: /Back to project kanban/ }).click();
  await page.locator('.card').filter({ hasText: project.title }).locator('[data-card-preview]').click();
  await expect(page.locator('#drawer-meta')).toContainText('Test Design');
  await expect(page.locator('#drawer-summary')).toContainText('Project stage');
  await expect(page.locator('#drawer-summary')).not.toContainText('用例设计');
  await expect(page.locator('#btn-drawer-folder')).toHaveText('Open project files');
});

test('project section navigation retains keyboard focus and testcase labels track expansion', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  const tabs = page.locator('#project-detail-tabs');
  const qualityTab = tabs.locator('[data-detail-tab="qualityTasks"]');
  await qualityTab.focus();
  await qualityTab.press('Enter');
  await expect(tabs.locator('[data-detail-tab="qualityTasks"]')).toBeFocused();

  await tabs.locator('[data-detail-tab="traceability"]').click();
  const requirement = page.locator('#requirement-matrix .requirement-row').first();
  await requirement.locator('[data-requirement-expand]').click();
  const testcase = page.locator('.requirement-detail-row [data-linked-testcase-id]').first();
  const toggle = testcase.locator('[data-testcase-expand]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-label', /收起用例/);
});

test('English overview uses singular counts for one linked case and one risk', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.addInitScript(() => localStorage.setItem('dsh-qa-lang', 'en'));
  await page.goto('/');
  await page.locator('.nav-item[data-view="board"]').click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await expect(page.locator('#view-project-detail')).toBeVisible();
  const coverageRow = page.locator('.overview-coverage-panel .coverage-mini').filter({ hasText: '支付回调处理' });
  await expect(coverageRow).toContainText('1 linked case');
  await expect(coverageRow).not.toContainText('1 linked cases');

  const created = await request.post('/api/projects', { data: { title: `plural-check-${Date.now()}`, createWorkspace: false } });
  const { project: taskProject } = await created.json();
  const taskResponse = await request.post(`/api/projects/${taskProject.id}/quality-tasks`, { data: { title: 'plural risk task' } });
  const { task } = await taskResponse.json();
  await request.post(`/api/projects/${taskProject.id}/quality-tasks/${task.id}/manual-analyses`, { data: {
    expectedRevision: task.version,
    actorLabel: 'qa',
    sourceDigests: [],
    acceptanceCriteria: [{ id: 'plural-acceptance', condition: 'One risk must be visible' }],
    risks: [{ id: 'plural-risk', title: 'One open risk', severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
    testScope: [{ id: 'plural-scope', title: 'Risk scope' }],
  } });

  await page.goto('/');
  await page.locator('.nav-item[data-view="board"]').click();
  await page.locator('.card').filter({ hasText: taskProject.title }).click();
  await expect(page.locator('#view-project-detail')).toBeVisible();
  const taskRow = page.locator(`[data-overview-task="${task.id}"]`);
  await expect(taskRow).toContainText('1 risk to review');
  await expect(taskRow).not.toContainText('1 risks to review');
});

test('mobile project actions share one menu and the breadcrumb fits at 320px', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.setViewportSize({ width: 390, height: 640 });
  const moreActions = page.locator('#project-detail-more');
  await expect(moreActions.locator('summary')).toHaveAccessibleName('更多操作');
  for (const id of ['btn-project-detail-chat', 'btn-project-detail-folder', 'btn-project-detail-edit', 'btn-project-detail-settings', 'btn-project-detail-delete']) {
    await expect(moreActions.locator(`#${id}`)).toBeAttached();
  }
  await moreActions.locator('summary').click();
  for (const id of ['btn-project-detail-chat', 'btn-project-detail-folder', 'btn-project-detail-edit', 'btn-project-detail-settings', 'btn-project-detail-delete']) {
    await expect(moreActions.locator(`#${id}`)).toBeVisible();
  }

  await page.setViewportSize({ width: 320, height: 640 });
  const topbar = page.locator('.project-detail-topbar');
  const overflow = await topbar.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
  const back = await page.locator('#btn-project-detail-back').boundingBox();
  expect(back.x + back.width).toBeLessThanOrEqual(320);
  await moreActions.locator('#btn-project-detail-edit').click();
  await expect(moreActions).toHaveJSProperty('open', false);
});

test('mobile project identity and section navigation stay visible while scrolling', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.materials = Array.from({ length: 24 }, (_, index) => ({ id: `mobile-material-${index}`, label: `移动端材料 ${index + 1}`, type: 'spec', ts: `2026-11-${String(15 - (index % 14)).padStart(2, '0')}T12:00:00.000Z` }));
  });
  await openProjectFromBoard(page, project);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.locator('[data-detail-tab="activity"]').click();
  const view = page.locator('#view-project-detail');
  await view.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  const crumbTitle = page.locator('#project-detail-crumb-title');
  await expect(crumbTitle).toBeVisible();
  await expect(crumbTitle).toHaveText(project.title);
  const viewTop = await view.evaluate((element) => element.getBoundingClientRect().top);
  const topbar = await page.locator('.project-detail-topbar').boundingBox();
  const sidebar = await page.locator('#view-project-detail .project-detail-layout > .detail-sidebar').boundingBox();
  const tabs = await page.locator('#project-detail-tabs').boundingBox();
  expect(Math.abs(topbar.y - viewTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(sidebar.y - (topbar.y + topbar.height))).toBeLessThanOrEqual(5);
  expect(tabs.y).toBeLessThan(topbar.y + topbar.height + 20);
  await page.locator('#project-detail-tabs [data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#project-detail-tabs [data-detail-tab="qualityTasks"]')).toHaveAttribute('aria-current', 'page');
});

test('switching workspace sections from a deep scroll returns to the section top', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.materials = Array.from({ length: 30 }, (_, index) => ({ id: `switch-material-${index}`, label: `切换材料 ${index + 1}`, type: 'spec', ts: `2026-11-${String(15 - (index % 14)).padStart(2, '0')}T12:00:00.000Z` }));
    p.history = Array.from({ length: 20 }, (_, index) => ({ at: `2026-10-${String(20 - (index % 15)).padStart(2, '0')}T10:00:00.000Z`, to: 'design', by: 'owner' }));
  });
  await openProjectFromBoard(page, project);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator('[data-detail-tab="activity"]').click();
  const view = page.locator('#view-project-detail');
  await view.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => view.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.locator('[data-detail-tab="overview"]').click();
  await expect.poll(() => view.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('#project-detail-title')).toHaveText('项目概况');
});

test('project action navigation avoids smooth scrolling when reduced motion is enabled', async ({ page, request }) => {
  const project = await seededProject(request);
  await page.addInitScript(() => {
    window.__detailScrollBehavior = null;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (this.dataset?.milestoneId === 'motion-milestone' || this.id === 'project-overview-extra') window.__detailScrollBehavior = options?.behavior || 'auto';
      return original?.call(this, options);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await patchProjectResponse(page, project.id, (p) => {
    p.milestones = [{ id: 'motion-milestone', title: '动作跳转目标', kind: 'release', dueDate: '2099-01-01', done: false }];
  });
  await page.route(`**/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.items = [{
      id: 'reduced-motion-action', projectId: project.id, projectTitle: project.title,
      kind: 'milestone_overdue', titleKey: 'action.reason.default', reasonCode: 'default',
      status: 'blocked', priority: 'high', actionRequired: true,
      target: { view: 'project-detail', tab: 'milestones', entityId: 'motion-milestone' },
    }];
    return route.fulfill({ response, json: payload });
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-action-id="reduced-motion-action"]').click();
  await expect(page.locator('[data-milestone-id="motion-milestone"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__detailScrollBehavior)).toBe('auto');
  await page.locator('#btn-project-detail-edit').click();
  await expect(page.locator('#project-overview-extra')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => window.__detailScrollBehavior)).toBe('auto');
});

test('quick preview includes the latest available activity', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.materials = [
      { label: '较早的记录', type: 'plan', ts: '2098-11-10T08:00:00.000Z' },
      { label: '最新验收记录', type: 'report', ts: '2099-11-15T08:00:00.000Z' },
    ];
    p.defects = [
      { id: 'closed-preview-defect', title: '已关闭问题', status: 'closed' },
      { id: 'verified-preview-defect', title: '已验证问题', status: 'verified' },
      { id: 'open-preview-defect', title: '待处理问题', status: 'open' },
    ];
    p.evidenceBundles = [
      { id: 'pending-preview-evidence', state: 'ready', integrity: 'pending' },
      { id: 'verified-preview-evidence', state: 'ready', integrity: 'verified' },
    ];
  });
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: project.title }).getByRole('button', { name: '快速预览' }).click();
  const recent = page.locator('#drawer-recent-activity');
  await expect(recent).toContainText('最新验收记录');
  await expect(recent).not.toContainText('较早的记录');
  const previewMetrics = page.locator('#tab-body .overview-metrics > div');
  await expect(previewMetrics.nth(2)).toContainText('1');
  await expect(previewMetrics.nth(3)).toContainText('已验证证据');
  await expect(previewMetrics.nth(3)).toContainText('1');
});

test('quick preview isolates late project loads and retries an initial failure', async ({ page, request }) => {
  const first = await seededProject(request);
  const second = (await (await request.post('/api/projects', { data: { title: `预览重试-${Date.now()}`, createWorkspace: false } })).json()).project;
  let releaseFirst;
  let signalFirstStarted;
  let signalFirstFinished;
  const waitForFirst = new Promise((resolve) => { signalFirstStarted = resolve; });
  const holdFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const finishFirst = new Promise((resolve) => { signalFirstFinished = resolve; });
  let releaseSecondFailure;
  let signalSecondStarted;
  const waitForSecondFailure = new Promise((resolve) => { signalSecondStarted = resolve; });
  const holdSecondFailure = new Promise((resolve) => { releaseSecondFailure = resolve; });
  let allowSecondSuccess = false;
  let secondGetCount = 0;
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.route(`**/api/projects/${encodeURIComponent(first.id)}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    signalFirstStarted();
    await holdFirst;
    await route.fulfill({ response });
    signalFirstFinished();
  });
  await page.route(`**/api/projects/${encodeURIComponent(second.id)}`, async (route) => {
    if (route.request().method() === 'GET') secondGetCount += 1;
    if (route.request().method() === 'GET' && !allowSecondSuccess) {
      signalSecondStarted();
      await holdSecondFailure;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary preview failure' }) });
    }
    return route.continue();
  });
  await page.locator('.card').filter({ hasText: first.title }).locator('[data-card-preview]').click();
  await waitForFirst;
  await page.locator('#btn-close-drawer').click();
  await page.locator('.card').filter({ hasText: second.title }).locator('[data-card-preview]').click();
  await waitForSecondFailure;
  await expect(page.locator('#drawer-loading')).toBeVisible();
  releaseSecondFailure();
  await expect(page.locator('#drawer-load-error')).toContainText('temporary preview failure');
  await expect(page.locator('#drawer-title')).toHaveText(second.title);
  expect(secondGetCount).toBe(1);
  allowSecondSuccess = true;
  await page.locator('#drawer-load-retry').click();
  await expect(page.locator('#drawer-load-error')).toHaveCount(0);
  await expect(page.locator('#tab-body')).toHaveAttribute('aria-busy', 'false');
  expect(secondGetCount).toBe(2);

  releaseFirst();
  await finishFirst;
  await expect(page.locator('#drawer-title')).toHaveText(second.title);
  await expect(page.locator('#drawer')).toContainText(second.title);
});

test('defect evidence references open their matching delivery bundle', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.defects = [{ id: 'defect-evidence', title: '证据关联缺陷', status: 'open', severity: 'major', evidenceRefs: ['evidence-for-defect'] }];
    p.evidenceBundles = [{ id: 'evidence-for-defect', state: 'ready', integrity: 'verified', items: [] }];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="defectsRisks"]').click();
  await page.locator('[data-defect-id="defect-evidence"] [data-defect-details] > summary').click();
  const evidenceLink = page.locator('[data-defect-id="defect-evidence"] [data-open-defect-evidence="evidence-for-defect"]');
  await expect(evidenceLink).toBeVisible();
  await evidenceLink.click();
  await expect(page.locator('[data-detail-tab="delivery"]')).toHaveClass(/active/);
  await expect(page.locator('[data-evidence-bundle-id="evidence-for-defect"]')).toBeVisible();
});

test('expanded testcases link back to every associated requirement', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.testcases = [{ id: 'shared-case', title: '共享验证用例', status: 'reviewed', kind: 'functional', priority: 'high', risks: [] }];
    p.requirements = [
      { id: 'requirement-one', title: '支付主流程', kind: 'feature', statement: '完成支付', acceptance: '支付成功', links: [{ testcaseId: 'shared-case', purpose: '主流程验证' }] },
      { id: 'requirement-two', title: '支付幂等性', kind: 'feature', statement: '重复请求安全', acceptance: '只扣款一次', links: [{ testcaseId: 'shared-case', purpose: '重复请求验证' }] },
    ];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  const firstRequirement = page.locator('[data-requirement-id="requirement-one"]');
  await firstRequirement.locator('[data-requirement-expand]').click();
  const testcase = page.locator('[data-linked-testcase-id="shared-case"]').first();
  await testcase.locator('[data-testcase-expand]').click();
  const relatedRequirements = testcase.locator('[data-open-linked-requirement]');
  await expect(relatedRequirements).toHaveCount(2);
  await relatedRequirements.filter({ hasText: '支付幂等性' }).click();
  await expect(page.locator('#requirement-details-1')).toBeVisible();
});

test('failed Action Queue can be retried without leaving project detail', async ({ page, request }) => {
  const project = await seededProject(request);
  let failOnce = true;
  let projectDetailReads = 0;
  await page.route(`**/api/projects/${encodeURIComponent(project.id)}`, async (route) => {
    if (route.request().method() === 'GET') projectDetailReads += 1;
    return route.continue();
  });
  await page.route(`**/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`, async (route) => {
    if (failOnce) {
      failOnce = false;
      return route.fulfill({ status: 503, body: 'unavailable' });
    }
    return route.continue();
  });
  await openProjectFromBoard(page, project);
  const actionQueue = page.locator('#project-action-queue');
  await expect(actionQueue).toHaveAttribute('data-load-state', 'error');
  const retry = actionQueue.getByRole('button', { name: '重试行动队列' });
  await expect(retry).toBeVisible();
  const projectReadsBeforeRetry = projectDetailReads;
  await retry.click();
  await expect(actionQueue).toHaveAttribute('data-load-state', 'ready');
  await expect(page.locator('#view-project-detail')).toBeVisible();
  expect(projectDetailReads).toBe(projectReadsBeforeRetry);
});

test('empty project records are distinguished and offer a contextual next step', async ({ page, request }) => {
  const project = (await (await request.post('/api/projects', { data: { title: `无记录项目-${Date.now()}`, createWorkspace: false } })).json()).project;
  await patchProjectResponse(page, project.id, (p) => {
    p.requirements = [];
    p.testcases = [];
    p.defects = [];
    p.qualityTasks = [];
    p.evidenceBundles = [];
    p.reports = [];
    p.knowledge = [];
    p.minutes = [];
    p.materials = [];
    p.history = [];
    p.gates = [];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  await expect(page.locator('#requirement-empty-project [data-open-project-dsh]')).toBeVisible();
  await expect(page.locator('#unlinked-testcases')).toContainText('还没有登记测试用例');
  await expect(page.locator('#unlinked-testcases')).not.toContainText('所有用例都已关联');
  await expect(page.locator('#unlinked-testcases [data-open-project-dsh]')).toBeVisible();

  await page.locator('[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#quality-task-list [data-open-project-dsh]')).toBeVisible();
  await expect(page.locator('#quality-task-detail [data-open-project-dsh]')).toBeVisible();

  await page.locator('[data-detail-tab="defectsRisks"]').click();
  await expect(page.locator('#defect-records [data-open-project-dsh]')).toBeVisible();
  await page.locator('[data-detail-tab="delivery"]').click();
  await expect(page.locator('#quality-gate-summary [data-open-project-dsh]')).toBeVisible();
  await expect(page.locator('#quality-gate-status')).toHaveText('项目级 · 未评估');
  await expect(page.locator('#quality-gate-summary')).toContainText('尚无测试运行，无法评估项目级质量门禁。');
  await expect(page.locator('#detail-delivery-reports [data-open-project-dsh]')).toBeVisible();
  await expect(page.locator('#delivery-evidence-list [data-open-project-dsh]')).toBeVisible();
  await page.locator('[data-detail-tab="activity"]').click();
  await expect(page.locator('#detail-activity-knowledge [data-open-project-dsh]')).toBeVisible();
  await expect(page.locator('#detail-activity-minutes [data-open-project-dsh]')).toBeVisible();
});

test('traceability and task metadata use the declared 14px text size', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.qualityTasks = [{ id: 'font-size-task', title: '字号验证任务', stage: 'review', updatedAt: '2026-11-15T08:00:00.000Z', risks: [], testScope: [], acceptanceCriteria: [], sources: [], decisions: [] }];
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  await expect.poll(() => page.locator('.traceability-table th').first().evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px');
  await expect.poll(() => page.locator('.traceability-table td').first().evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px');
  await page.locator('[data-detail-tab="qualityTasks"]').click();
  await expect.poll(() => page.locator('.quality-task-choice-meta').first().evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px');
});

test('traceability hides the risk column when no requirement has risk or priority', async ({ page, request }) => {
  const project = await seededProject(request);
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="traceability"]').click();
  await expect(page.locator('.traceability-table th')).toHaveCount(4);
  await expect(page.locator('.traceability-table th').last()).toContainText('用例与状态');
});

test('Action Queue run and computed gate targets select their owning task and focus the exact record', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.qualityTasks = [
      { id: 'other-task', title: '其他质量任务', stage: 'intake', risks: [], testScope: [], acceptanceCriteria: [], sources: [], decisions: [] },
      { id: 'target-task', title: '支付回归任务', stage: 'review', risks: [], testScope: [], acceptanceCriteria: [], sources: [], decisions: [] },
    ];
    p.testruns = [{ id: 'target-run', status: 'failed', qualityTaskId: 'target-task', executor: 'node-test', summary: '目标运行详情' }];
    p.gates = [{ id: 'target-computed-gate', title: '支付自动评估', type: 'quality', kind: 'computed', status: 'pending', verdict: 'BLOCK', qualityTaskId: 'target-task', checks: [{ explanation: '证据尚未完整' }] }];
  });
  await page.route(`**/api/action-queue?projectId=${encodeURIComponent(project.id)}&limit=50`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const source = payload.items[0];
    return route.fulfill({ response, json: { ...payload, items: [
      { ...source, id: 'action-target-run', kind: 'run_failed', titleKey: 'action.runFailed.title', status: 'needs_action', actionRequired: true, target: { view: 'project-detail', tab: 'qualityTasks', entityId: 'target-run' } },
      { ...source, id: 'action-target-gate', kind: 'gate_blocked', titleKey: 'action.runFailed.title', status: 'blocked', actionRequired: true, target: { view: 'project-detail', tab: 'gates', entityId: 'target-computed-gate' } },
    ] } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openProjectFromBoard(page, project);
  await page.locator('[data-action-id="action-target-run"]').click();
  const qualityTab = page.locator('[data-detail-tab="qualityTasks"]');
  await expect(qualityTab).toHaveClass(/active/);
  const qualityTabIsVisible = await qualityTab.evaluate((tab) => {
    const nav = tab.parentElement.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    return item.left >= nav.left && item.right <= nav.right;
  });
  expect(qualityTabIsVisible).toBe(true);
  await expect(page.locator('[data-quality-task-select="target-task"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-project-test-run-id="target-run"]')).toHaveClass(/action-target-focus/);
  await expect(page.locator('[data-project-test-run-id="target-run"]')).toBeInViewport();

  await page.locator('[data-detail-tab="overview"]').click();
  await page.locator('[data-action-id="action-target-gate"]').click();
  const gate = page.locator('[data-gate-id="target-computed-gate"]');
  await expect(page.locator('[data-detail-tab="delivery"]')).toHaveClass(/active/);
  await expect(page.locator('#delivery-quality-task')).toHaveValue('target-task');
  await expect(gate).toHaveClass(/action-target-focus/);
  await expect(gate).toContainText('自动评估 · BLOCK');
  await expect(gate).toContainText('支付回归任务');
  await expect(gate).toContainText('证据尚未完整');
  await expect(gate.locator('[data-decision]')).toHaveCount(0);
});

test('ready evidence with pending integrity stays unverified across delivery, tasks, and defects', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.qualityTasks = [{ id: 'evidence-task', title: '证据校验任务', stage: 'review', risks: [], testScope: [], acceptanceCriteria: [], sources: [], decisions: [] }];
    p.evidenceBundles = [{ id: 'integrity-pending-bundle', state: 'ready', integrity: 'pending', qualityTaskId: 'evidence-task', items: [{ id: 'private-log', relativePath: 'results/private.log', mimeType: 'text/plain' }] }];
    p.defects = [{ id: 'integrity-pending-defect', title: '待校验证据缺陷', status: 'open', severity: 'major', evidenceRefs: ['integrity-pending-bundle'] }];
  });
  await openProjectFromBoard(page, project);

  await page.locator('[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('[data-quality-evidence-id="integrity-pending-bundle"]')).toContainText('完整性未验证');
  await page.locator('[data-detail-tab="defectsRisks"]').click();
  await expect(page.locator('[data-defect-id="integrity-pending-defect"] [data-open-defect-evidence]')).toContainText('完整性未验证');
  await page.locator('[data-detail-tab="delivery"]').click();
  const bundle = page.locator('[data-evidence-bundle-id="integrity-pending-bundle"]');
  await expect(bundle).toContainText('完整性未验证');
  await expect(bundle.locator('.evidence-item a')).toHaveCount(0);
});

test('active quality risks count and sort ahead of dismissed and resolved risks', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.defects = [];
    p.qualityTasks = [{ id: 'risk-sort-task', title: '风险排序任务', risks: [
      { id: 'resolved-risk', title: '已处置风险', severity: 'medium', dispositionStatus: 'mitigated' },
      { id: 'dismissed-risk', title: '已驳回风险', severity: 'high', assessmentStatus: 'dismissed', dispositionStatus: 'open' },
      { id: 'open-risk', title: '仍待确认风险', severity: 'high', dispositionStatus: 'open' },
      { id: 'accepted-risk', title: '已接受风险', severity: 'low', dispositionStatus: 'accepted' },
    ] }];
  });
  await openProjectFromBoard(page, project);
  await expect(page.locator('[data-detail-tab="defectsRisks"] .tab-count')).toHaveText('1');
  await page.locator('[data-detail-tab="defectsRisks"]').click();
  const riskIds = await page.locator('#quality-risk-records [data-quality-risk-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.qualityRiskId));
  expect(riskIds).toEqual(['open-risk', 'resolved-risk', 'dismissed-risk', 'accepted-risk']);
  await page.locator('[data-quality-risk-id="open-risk"] [data-open-quality-task]').click();
  await expect(page.locator('[data-detail-tab="qualityTasks"]')).toHaveClass(/active/);
  await expect(page.locator('#quality-task-detail [data-quality-task-id]')).toHaveAttribute('data-quality-task-id', 'risk-sort-task');
});

test('reopening project detail resets its internal scroll position', async ({ page, request }) => {
  const project = await seededProject(request);
  await patchProjectResponse(page, project.id, (p) => {
    p.events = Array.from({ length: 24 }, (_, index) => ({ id: `scroll-event-${index}`, title: `排期活动 ${index}`, type: 'meeting', date: '2099-01-01' }));
  });
  await openProjectFromBoard(page, project);
  await page.locator('[data-detail-tab="activity"]').click();
  const detailView = page.locator('#view-project-detail');
  await detailView.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => detailView.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: /返回项目看板/ }).click();
  await page.locator('.card').filter({ hasText: project.title }).click();
  await expect.poll(() => detailView.evaluate((element) => element.scrollTop)).toBe(0);
});
