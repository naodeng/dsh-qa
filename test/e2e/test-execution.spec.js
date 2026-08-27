import { test, expect } from '@playwright/test';

test('项目详情可以预览并执行本地测试', async ({ page }) => {
  const projectTitle = `执行工作台项目-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '新建测试项目' }).click();
  await page.locator('#nc-title').fill(projectTitle);
  await page.locator('#nc-workspace').uncheck();
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectTitle }).getByRole('button', { name: '完整详情' }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.getByRole('button', { name: '新建执行配置' })).toBeVisible();
  await page.getByRole('button', { name: '新建执行配置' }).click();
  await page.getByLabel('执行器').selectOption('node-test');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText(/unit · v1/)).toBeVisible();
});
