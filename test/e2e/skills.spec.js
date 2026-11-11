import { test, expect } from '../support/e2e-test.js';

test.describe('QA Skill 安装页', () => {
  async function openSkills(page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'QA Skill安装' }).click();
    await expect(page.locator('#view-skills')).toBeVisible();
    await expect(page.locator('.skill-card').first()).toBeVisible();
  }

  test('Skill Tab 可以访问并显示官网目录分类', async ({ page }) => {
    await openSkills(page);
    await expect(page.locator('#view-skills h1')).toHaveText('QA skills 安装页面');
    await expect(page.locator('.skill-category').first()).toContainText('测试类型');
    await expect(page.locator('.skill-card h3').first()).toHaveText('需求分析');
    await expect(page.locator('.skill-card p').first()).toHaveText('输入需求文档，整理信息缺口、风险和测试范围。');
    const available = page.locator('.skill-card').filter({ hasText: 'requirements-analysis' });
    await expect(available.getByRole('button', { name: '安装' })).toBeEnabled();
    const unavailable = page.locator('.skill-card').filter({ hasText: 'catalog-only-preview' });
    await expect(unavailable.getByRole('button', { name: '暂不可安装' })).toBeDisabled();
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
    await page.locator('#btn-settings').click();
    await page.locator('[data-settings-lang="en"]').click();
    await expect(page.locator('#view-skills h1')).toHaveText('QA skills installer');
    await expect(page.locator('.skill-category').first()).toContainText('Testing types');
  });

  test('Skill 页面刷新后仍可用且不会重复渲染', async ({ page }) => {
    await openSkills(page);
    const initialCount = await page.locator('.skill-card').count();
    await page.reload();
    await openSkills(page);
    await expect(page.locator('.skill-card')).toHaveCount(initialCount);
    await expect(page.locator('.skill-category').first()).toBeVisible();
  });
});
