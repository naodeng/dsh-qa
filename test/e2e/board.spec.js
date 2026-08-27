import { test, expect } from '@playwright/test';

test.describe('项目看板页', () => {
  test('看板页可以访问并显示看板', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await expect(page.locator('#view-board')).toBeVisible();
    await expect(page.locator('#board')).toBeVisible();
  });

  test('看板页可以打开项目详情并关闭抽屉', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await page.locator('.card').first().click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-title')).not.toHaveText('');
    await page.locator('#btn-close-drawer').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('项目卡片可直接进入完整详情页，卡片主体只打开快速预览', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    const card = page.locator('.card').first();
    await card.getByRole('button', { name: '完整详情' }).click();
    await expect(page.locator('#view-project-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: '项目详情' })).toBeVisible();
    await expect(page.locator('#project-detail-tabs')).toBeVisible();
    await page.getByRole('button', { name: '返回项目看板' }).click();
    await card.click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer #tabs')).toBeHidden();
    await expect(page.locator('#drawer').getByRole('button', { name: '进入完整详情' })).toBeVisible();
  });
});
