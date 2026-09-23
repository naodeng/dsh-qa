import { test, expect } from '@playwright/test';

const releaseFixture = {
  ok: true,
  currentVersion: '0.5.2',
  latestVersion: '0.5.3',
  isOutdated: true,
  dshVersion: 'dsh-v0.1.7-alpha.1',
  repositoryUrl: 'https://github.com/naodeng/dsh-qa',
  websiteZhUrl: 'https://inaodeng.com/zh-cn/dsh-qa/',
  websiteEnUrl: 'https://inaodeng.com/en/dsh-qa/',
  releases: [{
    version: '0.5.3',
    date: '2026-09-23',
    publishedAt: '2026-09-23T00:00:00.000Z',
    summaryZh: '中文摘要',
    summaryEn: 'English summary',
    detailUrl: 'https://github.com/naodeng/dsh-qa/releases/tag/v0.5.3',
  }],
};

test.describe('首页', () => {
  test('首页可以访问并显示核心工作区', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /(上午|下午|晚上)好/ })).toBeVisible();
    await expect(page.locator('#metric-cards')).toBeVisible();
    await expect(page.getByRole('heading', { name: '需要你处理' })).toBeVisible();
  });

  test('首页可以创建项目和迭代', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /新建项目/ }).first().click();
    await page.locator('#nc-title').fill('首页 E2E 项目');
    await page.locator('#nc-ok').click();
    await expect(page.locator('#dashboard-cases')).toContainText('首页 E2E 项目');
  });

  test('首页可以打开新建迭代弹窗', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '新建迭代' }).click();
    await expect(page.locator('.modal')).toContainText('新建测试迭代');
    await page.locator('#nc-cancel').click();
  });

  test('首页在办项目主体进入完整详情，快速预览按钮打开抽屉', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('#dashboard-cases .case-overview-row').first();
    await row.click();
    await expect(page.locator('#view-project-detail')).toBeVisible();
    await page.getByRole('button', { name: '返回测试首页' }).click();
    await page.locator('#dashboard-cases .case-overview-row').first().getByRole('button', { name: '快速预览' }).click();
    await expect(page.locator('#drawer')).toBeVisible();
  });

  test('首页最多展示 5 个在办项目，项目看板保留全部项目', async ({ page }) => {
    for (let index = 1; index <= 6; index += 1) {
      const response = await page.request.post('/api/projects', { data: { title: `首页上限项目 ${index}`, createWorkspace: false } });
      expect(response.ok()).toBe(true);
    }
    await page.goto('/');
    await expect(page.locator('#dashboard-cases .case-overview-row')).toHaveCount(5);

    await page.getByRole('button', { name: '打开看板' }).click();
    expect(await page.locator('#board .card').count()).toBeGreaterThan(5);
  });

  test('右侧 DSH 辅助卡保持紧凑，不随在办项目列表拉伸', async ({ page }) => {
    await page.goto('/');
    const projectPanel = await page.locator('.case-overview-panel').boundingBox();
    const assistantPanel = await page.locator('.ai-control-panel').boundingBox();

    expect(projectPanel).not.toBeNull();
    expect(assistantPanel).not.toBeNull();
    expect(assistantPanel.height).toBeLessThan(320);
    expect(assistantPanel.height).toBeLessThan(projectPanel.height - 40);
  });

  test('设置弹窗移除主题和工作区宽度设置并保留基础可访问性属性', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#settings-modal [data-theme-option]')).toHaveCount(0);
    await expect(page.locator('#settings-modal [data-layout-preset]')).toHaveCount(0);
    await expect(page.locator('#service-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#service-status')).toHaveAttribute('aria-live', 'polite');
    await page.locator('#st-close').click();
  });

  test('设置按钮在浅色背景下保持高对比度', async ({ page }) => {
    await page.goto('/');
    const colors = await page.locator('#btn-settings').evaluate((button) => {
      const style = getComputedStyle(button);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(colors.color).not.toBe('rgb(255, 255, 255)');
    expect(colors.background).toBe('rgb(255, 255, 255)');
  });

  test('共享弹窗支持对话框语义、Escape 关闭和触发按钮焦点恢复', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).not.toHaveAttribute('data-theme', /.+/);
    await expect(page.locator('#rail-resizer')).toHaveAttribute('role', 'separator');
    await expect(page.locator('#case-resizer')).toHaveAttribute('role', 'separator');

    await page.locator('#btn-settings').focus();
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#settings-modal')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#settings-modal')).toHaveAttribute('aria-labelledby', /.+/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toHaveCount(0);
    await expect(page.locator('#btn-settings')).toBeFocused();
  });

  test('设置弹窗承载语言和关于信息，版本历史支持倒序分页', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-version')).toContainText('v0.5.3');
    await expect(page.locator('.avatar')).toHaveCount(0);
    await expect(page.locator('.theme-toggle')).toHaveCount(0);
    await expect(page.locator('#btn-lang')).toHaveCount(0);

    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).toContainText('关于');
    await expect(page.locator('#settings-modal')).toContainText('dsh-v0.1.7-alpha.1');
    await expect(page.locator('#settings-modal a[href="https://github.com/naodeng/dsh-qa"]')).toBeVisible();
    await expect(page.locator('#settings-modal a[href="https://inaodeng.com/zh-cn/dsh-qa/"]')).toHaveText('https://inaodeng.com/zh-cn/dsh-qa/');

    await page.locator('[data-settings-lang="en"]').click();
    await expect(page.locator('#settings-modal')).toContainText('About');
    await expect(page.locator('#settings-modal')).toContainText('Compatible DSH version');
    await expect(page.locator('#settings-modal a[href="https://inaodeng.com/en/dsh-qa/"]')).toHaveText('https://inaodeng.com/en/dsh-qa/');

    await page.locator('#st-close').click();
    await page.locator('#app-version').click();
    await expect(page.locator('#release-modal')).toBeVisible();
    await expect(page.locator('#release-list .release-row').first()).toContainText('v0.5.3');
    await expect(page.locator('#release-list .release-row').first()).toContainText('Polish the workbench');
    await expect(page.locator('#release-list .release-row')).toHaveCount(5);
    await expect(page.locator('#release-next')).toBeEnabled();
    await page.locator('#release-next').click();
    await expect(page.locator('#release-page-label')).toContainText('2');
    await expect(page.locator('#release-list .release-row').first()).not.toContainText('v0.5.3');
  });

  test('切回中文后服务状态和首页操作按钮同步恢复中文', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="en"]').click();
    await page.locator('#st-close').click();
    await expect(page.locator('#service-status span')).toHaveText('Open from DSH');
    await expect(page.locator('#btn-new-iteration')).toContainText('New iteration');
    await expect(page.locator('#btn-new-case')).toContainText('New project');

    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="zh"]').click();
    await expect(page.locator('#service-status span')).toHaveText('请从 DSH 打开');
    await expect(page.locator('#btn-new-iteration')).toContainText('新建迭代');
    await expect(page.locator('#btn-new-case')).toContainText('新建项目');
  });

  test('版本摘要只展示当前语言，不跨语言回退', async ({ page }) => {
    let currentReleaseFixture = releaseFixture;
    await page.route('**/api/app-info', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentReleaseFixture),
    }));
    await page.goto('/');

    await expect(page.locator('#app-version-alert')).toBeVisible();
    await page.locator('#app-version').click();
    await expect(page.locator('#app-version-alert')).toBeHidden();
    await expect(page.locator('#release-list .release-row').first()).toContainText('中文摘要');
    await expect(page.locator('#release-list .release-row').first()).not.toContainText('English summary');
    await page.locator('#release-close').click();

    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="en"]').click();
    await page.locator('#st-close').click();
    await page.locator('#app-version').click();
    await expect(page.locator('#release-list .release-row').first()).toContainText('English summary');
    await expect(page.locator('#release-list .release-row').first()).not.toContainText('中文摘要');

    currentReleaseFixture = { ...releaseFixture, latestVersion: '0.5.4' };
    await page.reload();
    await expect(page.locator('#app-version-alert')).toBeVisible();
  });

  test('版本记录请求失败时显示重试，并可恢复版本列表', async ({ page }) => {
    let requestCount = 0;
    const firstFailure = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/app-info' && response.status() === 503);
    await page.route('**/api/app-info', (route) => {
      requestCount += 1;
      if (requestCount === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'metadata unavailable' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(releaseFixture) });
    });
    await page.goto('/');
    await firstFailure;
    await page.locator('#app-version').click();
    await expect(page.locator('#release-error')).toBeVisible();
    await expect(page.locator('#release-retry')).toBeVisible();

    await page.locator('#release-retry').click();
    await expect(page.locator('#release-list .release-row').first()).toContainText('v0.5.3');
  });

  test('Focus Canvas 在桌面、平板和手机宽度保持指标、导航和无横向溢出', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('#metric-cards .metric-card')).toHaveCount(4);
      await expect(page.locator('#btn-settings')).toBeVisible();
      await expect(page.locator('.nav-item[aria-label="DSH 测试对话"]')).toBeVisible();
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        body: document.body.scrollWidth <= document.body.clientWidth + 1,
      }));
      expect(overflow.document && overflow.body).toBe(true);
      const settingsColors = await page.locator('#btn-settings').evaluate((button) => {
        const style = getComputedStyle(button);
        return { color: style.color, background: style.backgroundColor };
      });
      expect(settingsColors.color).not.toBe('rgb(255, 255, 255)');
      expect(settingsColors.background).toBe('rgb(255, 255, 255)');
    }
  });
});
