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
  await page.getByRole('button', { name: '新建质量任务' }).click();
  await page.getByLabel('任务名称').fill('计算回归任务');
  await page.getByRole('button', { name: '创建任务' }).click();
  await expect(page.getByText('计算回归任务')).toBeVisible();
  const calculatedAnswers = ['sha256:change-1', '计算回归'];
  const calculatedDialog = (dialog) => dialog.accept(calculatedAnswers.shift() || '');
  page.on('dialog', calculatedDialog);
  await page.getByRole('button', { name: '计算回归集' }).click();
  page.off('dialog', calculatedDialog);
  await expect(page.getByText(/计算回归 · calculated · 0\/0 个用例/)).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('核心回归'));
  await page.getByRole('button', { name: '新建回归集' }).click();
  await expect(page.getByText(/核心回归 · manual · 0\/0 个用例/)).toBeVisible();

  await page.locator('#btn-settings').click();
  await page.locator('[data-settings-lang="en"]').click();
  await page.locator('#st-close').click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.getByRole('heading', { name: 'Quality evidence' })).toBeVisible();
  await expect(page.getByText('Before/after comparison')).toBeVisible();
});
