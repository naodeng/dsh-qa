import { test, expect } from '../support/e2e-test.js';

test.describe('DSH 测试对话页', () => {
  test('初始化和切换面板布局时保留收起按钮图标', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();

    for (const selector of ['#btn-collapse-rail', '#btn-collapse-cases', '#btn-collapse-context']) {
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
      const navLabel = page.locator('#rail .nav-item[data-view="assistant"] span');
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
    const navLabel = page.locator('#rail .nav-item[data-view="assistant"] span');
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
    await expect(page.locator('.nav-item[aria-label="DSH 测试对话"]')).toBeVisible();
    await page.locator('.nav-item[aria-label="DSH 测试对话"]').click();
    await expect(page.locator('#view-assistant')).toBeVisible();
    await expect(page.locator('#chat-pane')).toBeVisible();
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
