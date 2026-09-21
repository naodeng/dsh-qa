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
