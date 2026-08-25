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

  test('首页可以切换主题并暴露基础可访问性属性', async ({ page }) => {
    await page.goto('/');
    const initialTheme = await page.locator('body').getAttribute('data-theme');
    await page.locator('#btn-settings').click();
    await page.locator('[data-theme-option="terminal"]').click();
    await expect(page.locator('body')).not.toHaveAttribute('data-theme', initialTheme);
    await expect(page.locator('#service-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#service-status')).toHaveAttribute('aria-live', 'polite');
  });
});
