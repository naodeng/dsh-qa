import { test, expect } from '@playwright/test';

test.describe('项目看板页', () => {
  test('看板页可以访问并显示看板', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await expect(page.locator('#view-board')).toBeVisible();
    await expect(page.locator('#board')).toBeVisible();
  });

  test('看板卡片的快速预览按钮可以打开并关闭抽屉', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await page.locator('.card').first().getByRole('button', { name: '快速预览' }).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-title')).not.toHaveText('');
    await page.locator('#btn-close-drawer').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('点击项目卡片主体直接进入完整详情页', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    const card = page.locator('.card').first();
    await card.click();
    await expect(page.locator('#view-project-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: '项目详情' })).toBeVisible();
    await expect(page.locator('#project-detail-tabs')).toBeVisible();
    await page.getByRole('button', { name: '返回项目看板' }).click();
    await card.getByRole('button', { name: '快速预览' }).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer #tabs')).toBeHidden();
    await expect(page.locator('#drawer').getByRole('button', { name: '进入完整详情' })).toBeVisible();
  });

  test('项目详情实时刷新并可滚动到底部保存信息', async ({ page }) => {
    const title = `详情滚动回归项目-${Date.now()}`;
    const createdResponse = await page.request.post('/api/projects', { data: { title, createWorkspace: false } });
    expect(createdResponse.ok()).toBe(true);
    const { project } = await createdResponse.json();
    try {
      await page.goto('/');
      await page.getByRole('button', { name: '项目看板' }).click();
      await page.locator('.card').filter({ hasText: title }).click();
      await expect(page.locator('#project-detail-body')).toBeVisible();

      const updatedTitle = `${title}-已更新`;
      const updatedResponse = await page.request.patch(`/api/projects/${project.id}`, { data: { title: updatedTitle } });
      expect(updatedResponse.ok()).toBe(true);
      await expect(page.locator('#project-detail-meta')).toContainText(updatedTitle);

      const body = page.locator('#project-detail-body');
      const overflow = await body.evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
      expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
      await body.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
      await expect(page.locator('#ov-save')).toBeInViewport();

      await page.locator('#ov-title').fill(`${updatedTitle}-保存`);
      await page.locator('#ov-save').click();
      await expect(page.locator('.toast.ok')).toContainText('项目信息已保存');
    } finally {
      await page.request.delete(`/api/projects/${project.id}`);
    }
  });

  test('项目操作使用工作台确认弹窗而不是浏览器地址提示', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '项目看板' }).click();
    await page.locator('.card').first().click();
    await expect(page.locator('#project-detail-body')).toBeVisible();

    await page.locator('#project-detail-body').getByRole('button', { name: '新建 DSH 对话', exact: true }).click();
    const modal = page.locator('#modal-root .modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveRole('dialog');
    await expect(modal).toContainText('原对话不会删除');
    await expect(modal).not.toContainText('127.0.0.1');
    await modal.getByRole('button', { name: '取消', exact: true }).click();
    await expect(modal).toBeHidden();
  });
});
