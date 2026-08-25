import { test, expect } from '@playwright/test';

test.describe('日历排期页', () => {
  test('日历页可以访问并显示日历', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '日历排期' }).click();
    await expect(page.locator('#view-calendar')).toBeVisible();
    await expect(page.locator('#full-calendar')).toBeVisible();
    await expect(page.locator('#cal-today')).toHaveAttribute('aria-label', '回到今天');
  });

  test('日历页可以切换月份和打开新增日程', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '日历排期' }).click();
    await page.locator('#cal-next').click();
    await expect(page.locator('#full-calendar')).toBeVisible();
    await page.locator('#btn-add-schedule').click();
    await expect(page.locator('.modal')).toContainText('新建日程');
    await page.locator('#sc-cancel').click();
  });
});
