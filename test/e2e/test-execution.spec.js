import { test, expect } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

test('项目详情可以预览并执行本地测试', async ({ page }) => {
  const projectTitle = `执行工作台项目-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '新建测试项目' }).click();
  await page.locator('#nc-title').fill(projectTitle);
  const projectCreated = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建项目' }).click();
  const { project } = await (await projectCreated).json();
  const workspacePath = project.workspacePath;
  expect(workspacePath).toBeTruthy();
  const fixturePath = join(workspacePath, 'test/fixtures/runner/pass.fixture.mjs');
  await mkdir(dirname(fixturePath), { recursive: true });
  await copyFile(resolve('test/fixtures/runner/pass.fixture.mjs'), fixturePath);
  await page.getByRole('button', { name: '项目看板' }).click();
  await page.locator('.card').filter({ hasText: projectTitle }).click();
  await page.locator('#project-detail-tabs button[data-detail-tab="qualityTasks"]').click();
  await expect(page.getByRole('button', { name: '新建执行配置' })).toBeVisible();
  await page.getByRole('button', { name: '新建执行配置' }).click();
  await page.getByLabel('执行器').selectOption('node-test');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText(/unit · v1/)).toBeVisible();
});
