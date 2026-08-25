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
    await expect(page.locator('#view-assistant')).toBeVisible();
    await page.locator('#btn-case-detail').click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-title')).not.toHaveText('');
    await page.locator('#btn-close-drawer').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });
});
