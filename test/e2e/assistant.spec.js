import { test, expect } from '@playwright/test';

test.describe('DSH 测试对话页', () => {
  test('对话页可以访问并显示项目协作区域', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'DSH 测试对话' }).click();
    await expect(page.locator('#view-assistant')).toBeVisible();
    await expect(page.locator('#case-list')).toBeVisible();
    await expect(page.locator('#chat-pane')).toBeVisible();
  });

  test('对话页可以切换中英文基础界面', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-lang').click();
    await expect(page.locator('.brand-copy')).toHaveText('QA Workbench');
    await page.getByRole('button', { name: 'DSH Test Chat' }).click();
    await expect(page.locator('#chat-head .chat-kicker')).toContainText('Test Mode');
    await page.locator('#btn-lang').click();
    await expect(page.locator('.brand-copy')).toHaveText('QA 工作台');
  });
});
