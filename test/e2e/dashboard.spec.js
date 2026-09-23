import { test, expect } from '@playwright/test';

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

  test('设置弹窗承载语言和关于信息，版本历史支持倒序分页', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-version')).toContainText('v0.5.2');
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
    await expect(page.locator('#release-list .release-row').first()).toContainText('v0.5.2');
    await expect(page.locator('#release-list .release-row').first()).toContainText('Add a settings dialog');
    await expect(page.locator('#release-list .release-row')).toHaveCount(5);
    await expect(page.locator('#release-next')).toBeEnabled();
    await page.locator('#release-next').click();
    await expect(page.locator('#release-page-label')).toContainText('2');
    await expect(page.locator('#release-list .release-row').first()).not.toContainText('v0.5.2');
  });
});
