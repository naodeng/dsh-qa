import { test, expect } from '@playwright/test';

test('项目详情展示质量门禁的评估入口和交付依据区域', async ({ page }) => {
  const title = `门禁浏览器项目-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '新建测试项目' }).click();
  await page.locator('#nc-title').fill(title);
  await page.locator('#nc-workspace').uncheck();
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await page.getByRole('button', { name: '新建质量任务' }).click();
  await page.getByLabel('任务名称').fill('门禁任务');
  await page.getByRole('button', { name: '创建任务' }).click();
  await expect(page.getByRole('button', { name: '评估质量门禁' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '门禁趋势' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '交付报告' })).toBeVisible();
  await page.getByRole('button', { name: '评估质量门禁' }).click();
  await expect(page.locator('#gate-report')).toContainText('BLOCK');
  await expect(page.locator('#gate-trend')).toContainText('BLOCK');
  await expect(page.getByRole('button', { name: '添加门禁例外' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: title }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.locator('#gate-report')).toContainText('BLOCK');
  await expect(page.locator('#gate-trend')).toContainText('BLOCK');
});
