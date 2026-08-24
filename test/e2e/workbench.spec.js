import { test, expect } from '@playwright/test';

test('user can create a project from the workbench', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /(上午|下午|晚上)好/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '需要你处理' })).toBeVisible();
  await expect(page.locator('.attention-action').first()).toBeVisible();
  await page.getByRole('button', { name: /新建项目/ }).first().click();
  await expect(page.locator('#nc-title')).toBeVisible();
  await page.locator('#nc-title').fill('浏览器回归项目');
  await page.locator('#nc-ok').click();
  await expect(page.locator('#case-list')).toContainText('浏览器回归项目');
  await expect(page.locator('#dashboard-cases')).toContainText('浏览器回归项目');
});

test('user can switch the workbench language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand-copy')).toBeVisible();
  await expect(page.locator('.brand-copy')).toHaveText('QA 工作台');
  await page.locator('#btn-lang').click();

  await expect(page.locator('#lang-label')).toHaveText('EN / 中');
  await expect(page.locator('.brand-copy')).toHaveText('QA Workbench');
  await expect(page.locator('.nav-item').first()).toContainText('Dashboard');
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();

  await page.locator('#btn-lang').click();
  await expect(page.locator('#lang-label')).toHaveText('中 / EN');
  await expect(page.locator('.nav-item').first()).toContainText('测试首页');
});

test('user can inspect a project from the board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await expect(page.locator('#view-board')).toBeVisible();
  await page.locator('.card').first().click();

  await expect(page.locator('#view-assistant')).toBeVisible();
  await expect(page.locator('#btn-case-detail')).toBeEnabled();
  await page.locator('#btn-case-detail').click();
  await expect(page.locator('#drawer')).toBeVisible();
  await expect(page.locator('#drawer-title')).not.toHaveText('');

  await page.locator('#tabs').getByRole('button', { name: /测试用例/ }).click();
  await expect(page.locator('#drawer-section-title')).toHaveText('测试用例');
  await expect(page.locator('#drawer .list-item').first()).toBeVisible();
  await page.locator('#btn-close-drawer').click();
  await expect(page.locator('#drawer')).toBeHidden();
});

test('user can move between board and calendar views', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板' }).click();
  await expect(page.locator('#view-board')).toBeVisible();
  await page.getByRole('button', { name: '日历排期' }).click();
  await expect(page.locator('#view-calendar')).toBeVisible();
  await expect(page.locator('#full-calendar')).toBeVisible();
  await expect(page.locator('#calendar-agenda')).toContainText('用例评审会');
});

test('user can switch visual themes without leaving the dashboard', async ({ page }) => {
  await page.goto('/');
  const initialTheme = await page.locator('body').getAttribute('data-theme');
  await page.locator('#btn-settings').click();
  await page.locator('[data-theme-option="terminal"]').click();

  await expect(page.locator('body')).not.toHaveAttribute('data-theme', initialTheme);
  await expect(page.locator('#metric-cards')).toBeVisible();
  await expect(page.getByRole('heading', { name: '需要你处理' })).toBeVisible();
});

test('user can open the new iteration dialog from the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建迭代' }).click();

  await expect(page.locator('.modal')).toContainText('新建测试迭代');
  await expect(page.locator('#nc-title')).toBeVisible();
  await page.locator('#nc-cancel').click();
  await expect(page.locator('.modal')).toBeHidden();
});
