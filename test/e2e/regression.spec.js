import { test, expect } from '@playwright/test';

test('质量证据与回归工作台提供空状态、创建流程和双语界面', async ({ page }) => {
  const marker = Date.now();
  const projectTitle = `证据回归项目-${marker}`;
  await page.goto('/');
  await page.getByRole('button', { name: '新建测试项目' }).click();
  await page.locator('#nc-title').fill(projectTitle);
  await page.locator('#nc-workspace').uncheck();
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectTitle }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();

  await expect(page.getByRole('heading', { name: '质量证据' })).toBeVisible();
  await expect(page.getByText('暂无证据包')).toBeVisible();
  await expect(page.getByText('修复前后对比')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('核心回归'));
  await page.getByRole('button', { name: '新建回归集' }).click();
  await expect(page.getByText(/核心回归 · 0 个用例/)).toBeVisible();

  await page.locator('#btn-lang').click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.getByRole('heading', { name: 'Quality evidence' })).toBeVisible();
  await expect(page.getByText('Before/after comparison')).toBeVisible();
});
