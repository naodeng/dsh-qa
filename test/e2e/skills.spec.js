import { test, expect } from '@playwright/test';

test.describe('QA Skill 安装页', () => {
  async function openSkills(page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'QA Skill安装' }).click();
    await expect(page.locator('#view-skills')).toBeVisible();
  }

  test('Skill Tab 可以访问并显示官网分类', async ({ page }) => {
    await openSkills(page);
    await expect(page.locator('#view-skills h1')).toHaveText('QA skills 安装页面');
    await expect(page.locator('.skill-category').first()).toContainText('测试类型');
    await expect(page.locator('.skill-card').first()).toBeVisible();
  });

  test('Skill 页面搜索、清空和语言切换正常', async ({ page }) => {
    await openSkills(page);
    const initialCount = await page.locator('.skill-card').count();
    await page.locator('#skills-search').fill('api-test');
    const filteredNames = await page.locator('.skill-card code').allTextContents();
    expect(filteredNames).toEqual(expect.arrayContaining(['api-test-bruno', 'api-test-pytest']));
    await expect(page.locator('.skill-card code').filter({ hasText: 'requirements-analysis' })).toHaveCount(0);
    await page.locator('#skills-search').fill('');
    await expect.poll(() => page.locator('.skill-card').count()).toBe(initialCount);
    await page.locator('#btn-lang').click();
    await expect(page.locator('#view-skills h1')).toHaveText('QA skills installer');
    await expect(page.locator('.skill-category').first()).toContainText('Testing types');
  });
});
