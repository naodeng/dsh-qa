import { test, expect } from '@playwright/test';

test.describe('项目看板页', () => {
  test('看板页可以访问并显示看板', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await expect(page.locator('#view-board')).toBeVisible();
    await expect(page.locator('#board')).toBeVisible();
  });

  test('看板卡片的快速预览按钮可以打开并关闭抽屉', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await page.locator('.card').first().getByRole('button', { name: '快速预览' }).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-title')).not.toHaveText('');
    await page.locator('#btn-close-drawer').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('点击项目卡片主体直接进入完整详情页', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    const card = page.locator('.card').first();
    await card.click();
    await expect(page.locator('#view-project-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: '项目详情' })).toBeVisible();
    await expect(page.locator('#project-detail-tabs')).toBeVisible();
    await page.getByRole('button', { name: '返回项目看板' }).click();
    await card.getByRole('button', { name: '快速预览' }).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer #tabs')).toBeHidden();
    await expect(page.locator('#drawer').getByRole('button', { name: '进入完整详情' })).toBeVisible();
  });
});
