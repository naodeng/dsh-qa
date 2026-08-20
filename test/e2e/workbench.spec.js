import { test, expect } from '@playwright/test';

test('user can create a project from the workbench', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /(上午|下午)好/ })).toBeVisible();
  await page.getByRole('button', { name: /新建项目/ }).first().click();
  await expect(page.locator('#nc-title')).toBeVisible();
  await page.locator('#nc-title').fill('浏览器回归项目');
  await page.locator('#nc-ok').click();
  await expect(page.locator('#case-list')).toContainText('浏览器回归项目');
  await expect(page.locator('#dashboard-cases')).toContainText('浏览器回归项目');
});
