import { test, expect } from '../support/e2e-test.js';

test.describe('DSH 测试对话页', () => {
  test('初始化和切换面板布局时保留收起按钮图标', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();

    for (const selector of ['#btn-collapse-cases', '#btn-collapse-context']) {
      await expect(page.locator(`${selector} svg`)).toBeVisible();
    }

    await page.locator('#btn-collapse-context').click();
    await expect(page.locator('#btn-collapse-context svg')).toHaveCount(1);
    await expect(page.locator('#btn-collapse-context')).toHaveAttribute('aria-expanded', 'false');
  });

  test('项目雷达的实时状态徽标文字保持可见', async ({ page }) => {
    await page.goto('/');
    const liveBadge = page.locator('#context-panel .live-dot');
    await expect(liveBadge).toHaveText('LIVE');

    const colors = await liveBadge.evaluate((element) => {
      const style = getComputedStyle(element);
      return { text: style.color, background: style.backgroundColor };
    });
    expect(colors.text).not.toBe(colors.background);
  });

  test('窄桌面宽度下导航和项目元信息保持单行', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const title = `窄栏布局 ${Date.now()}`;
    const response = await page.request.post('/api/projects', {
      data: { title, createWorkspace: false },
    });
    expect(response.ok()).toBe(true);
    const created = await response.json();

    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'DSH 测试对话' }).click();
      const navLabel = page.locator('#btn-topbar-chat span');
      const navHeight = await navLabel.evaluate((element) => element.getBoundingClientRect().height);
      const navLineHeight = await navLabel.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
      expect(navHeight).toBeLessThanOrEqual(navLineHeight + 1);

      const caseItem = page.locator('#case-list .case-item').filter({ hasText: title });
      await expect(caseItem).toBeVisible();
      const metadata = caseItem.locator('.ci-meta span');
      await expect(metadata.first()).toBeVisible();
      const heights = await metadata.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
      const lineHeight = await metadata.first().evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
      expect(heights.every((height) => height <= lineHeight + 1)).toBe(true);
      const metadataTops = await metadata.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
      expect(metadataTops.every((top) => Math.abs(top - metadataTops[0]) <= 1)).toBe(true);
    } finally {
      await page.request.delete(`/api/projects/${encodeURIComponent(created.project.id)}`);
    }
  });

  test('旧版默认项目栏宽度升级后能在一行展示项目元信息', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('dsh-qa-layout', JSON.stringify({ cases: 220 })));
    await page.reload();
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();

    await expect(page.locator('#case-sidebar')).toHaveCSS('width', '300px');
    await expect(page.locator('#case-list .case-item').first()).toBeVisible();
    const metadata = page.locator('#case-list .case-item').first().locator('.ci-meta span');
    const metadataTops = await metadata.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(metadataTops.length).toBeGreaterThan(1);
    expect(metadataTops.every((top) => Math.abs(top - metadataTops[0]) <= 1)).toBe(true);
  });

  test('启动时把已保存的过窄导航宽度恢复到可读下限', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('dsh-qa-layout', JSON.stringify({ rail: 150, railCollapsed: false })));
    await page.reload();

    await expect(page.locator('#rail')).toHaveCSS('width', '208px');
    const navLabel = page.locator('#btn-topbar-chat span');
    const navHeight = await navLabel.evaluate((element) => element.getBoundingClientRect().height);
    const navLineHeight = await navLabel.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
    expect(navHeight).toBeLessThanOrEqual(navLineHeight + 1);
  });

  test('对话页可以访问并显示项目协作区域', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();
    await expect(page.locator('#view-assistant')).toBeVisible();
    await expect(page.locator('#case-list')).toBeVisible();
    await expect(page.locator('#chat-pane')).toBeVisible();
  });

  test('手机宽度仍可从窄导航进入 DSH 对话主面板', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#mobile-nav [data-view="assistant"]:visible')).toBeVisible();
    await page.locator('#mobile-nav [data-view="assistant"]:visible').click();
    await expect(page.locator('#view-assistant')).toBeVisible();
    await expect(page.locator('#chat-pane')).toBeVisible();
  });

  test('平板与手机布局保留聊天宽度、侧栏入口和项目操作', async ({ page }) => {
    await page.setViewportSize({ width: 1216, height: 900 });
    await page.goto('/');
    await page.locator('[data-view="assistant"]:visible').first().click();
    await expect(page.locator('#btn-mobile-cases')).toBeVisible();
    await expect(page.locator('#btn-mobile-context')).toBeVisible();
    await expect(page.locator('#case-resizer')).toBeHidden();
    await expect(page.locator('#context-resizer')).toBeHidden();

    const tabletLayout = await page.evaluate(() => ({
      chatWidth: document.querySelector('#chat-pane').getBoundingClientRect().width,
      hiddenCasesRight: document.querySelector('#case-sidebar').getBoundingClientRect().right,
      headerWidth: document.querySelector('#chat-head').clientWidth,
      headerScrollWidth: document.querySelector('#chat-head').scrollWidth,
    }));
    expect(tabletLayout.chatWidth).toBeGreaterThan(500);
    expect(tabletLayout.hiddenCasesRight).toBeLessThanOrEqual(1);
    expect(tabletLayout.headerScrollWidth).toBeLessThanOrEqual(tabletLayout.headerWidth + 1);

    await page.locator('#btn-mobile-cases').click();
    await expect(page.locator('#btn-mobile-cases')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#case-sidebar')).toBeVisible();
    await page.locator('#case-list .case-item').first().click();
    await expect(page.locator('#btn-mobile-cases')).toHaveAttribute('aria-expanded', 'false');
    await page.waitForFunction(() => document.querySelector('#case-sidebar').getBoundingClientRect().right <= 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#model-switch')).toBeVisible();
    await expect(page.locator('#btn-case-detail')).toBeVisible();
    await expect(page.locator('#btn-case-workspace')).toBeVisible();
    await expect(page.locator('#case-resizer')).toBeHidden();
    await expect(page.locator('#context-resizer')).toBeHidden();
    await page.waitForFunction(() => document.querySelector('#case-sidebar').getBoundingClientRect().right <= 1);
    const mobileLayout = await page.evaluate(() => ({
      hiddenCasesRight: document.querySelector('#case-sidebar').getBoundingClientRect().right,
      hiddenContextLeft: document.querySelector('#context-panel').getBoundingClientRect().left,
      viewportWidth: window.innerWidth,
    }));
    expect(mobileLayout.hiddenCasesRight).toBeLessThanOrEqual(1);
    expect(mobileLayout.hiddenContextLeft).toBeGreaterThanOrEqual(mobileLayout.viewportWidth);
  });

  test('没有项目时提供项目入口，不显示无法发送的对话示例', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/board', async (route) => {
      const response = await route.fetch();
      const board = await response.json();
      await route.fulfill({ response, body: JSON.stringify({ ...board, projects: [] }) });
    });
    await page.goto('/');
    await page.locator('[data-view="assistant"]:visible').first().click();

    await expect(page.locator('.chat-empty-no-project')).toContainText('先选择一个项目');
    await expect(page.locator('[data-empty-select-project]')).toBeVisible();
    await expect(page.locator('[data-empty-create-project]')).toBeVisible();
    await expect(page.locator('.dsh-prompt')).toHaveCount(0);
    await expect(page.locator('#chat-input')).toBeDisabled();

    await page.locator('[data-empty-select-project]').click();
    await expect(page.locator('#btn-mobile-cases')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#case-sidebar')).toBeVisible();
  });

  test('独立模式不再显示连接中或允许提交 DSH 对话', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-view="assistant"]:visible').first().click();

    await expect(page.locator('.chat-empty-standalone')).toContainText('请从 DSH 侧边栏打开工作台');
    await expect(page.locator('.dsh-prompt')).toHaveCount(0);
    await expect(page.locator('#chat-input')).toBeDisabled();
    await expect(page.locator('#btn-send')).toBeDisabled();
  });

  test('初始化请求完成后保留用户已经选择的页面', async ({ page }) => {
    let releaseAppInfo;
    const appInfoGate = new Promise((resolve) => { releaseAppInfo = resolve; });
    const appInfoResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/app-info');
    await page.route('**/api/app-info', async (route) => {
      await appInfoGate;
      await route.continue();
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();
    releaseAppInfo();
    await appInfoResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    await expect(page.locator('#view-assistant')).toBeVisible();
  });

  test('对话页可以切换中英文基础界面', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="en"]').click();
    await expect(page.locator('.brand-copy')).toContainText('QA Workbench');
    await page.locator('#st-close').click();
    await page.getByRole('button', { name: 'DSH Test Chat' }).click();
    await expect(page.locator('#chat-head .chat-mode-label')).toContainText('Test Mode');
    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="zh"]').click();
    await expect(page.locator('.brand-copy')).toContainText('QA 工作台');
    await page.locator('#st-close').click();
  });

  test('刷新后进入对话页不会覆盖已恢复的项目标题', async ({ page }) => {
    const title = `对话标题恢复回归 ${Date.now()}`;
    const response = await page.request.post('/api/projects', {
      data: { title, createWorkspace: false },
    });
    expect(response.ok()).toBe(true);
    const created = await response.json();

    try {
      await page.goto('/');
      await expect(page.locator('#metric-cards')).toBeVisible();
      await page.getByRole('button', { name: 'DSH 测试对话' }).click();
      const project = page.locator('#case-list .case-item').filter({ hasText: title });
      await expect(project).toBeVisible();
      await project.click();
      await expect(page.locator('#chat-head-title')).toHaveText(title);

      await page.getByRole('button', { name: '项目看板' }).click();
      await page.getByRole('button', { name: 'DSH 测试对话' }).click();
      await expect(page.locator('#chat-head-title')).toHaveText(title);

      await page.reload();
      await expect(page.locator('#metric-cards')).toBeVisible();
      await page.getByRole('button', { name: 'DSH 测试对话' }).click();
      await expect(project).toBeVisible();
      await project.click();
      await expect(page.locator('#chat-head-title')).toHaveText(title);
    } finally {
      await page.request.delete(`/api/projects/${encodeURIComponent(created.project.id)}`);
    }
  });
});
