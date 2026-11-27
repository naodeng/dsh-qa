import { test, expect } from '../support/e2e-test.js';

test('command palette filters and activates with the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cmd-palette')).toBeVisible();
  await page.locator('#cmd-input').fill('日历');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-view="calendar"]:visible').first()).toHaveAttribute('aria-current', 'page');
});

test('board type filters update counts and only render matching records', async ({ page, request }) => {
  const projects = (await (await request.get('/api/projects')).json()).projects;
  const iterations = projects.filter((project) => project.kind === 'iteration').length;
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板', exact: true }).first().click();
  const all = page.locator('[data-board-filter="all"]');
  const iteration = page.locator('[data-board-filter="iteration"]');
  await expect(all).toContainText('全部 (');
  await iteration.click();
  await expect(iteration).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#board .card')).toHaveCount(iterations);
  await expect(page.locator('#board .card')).toContainText('迭代');
});

test('mobile board stage tabs switch between one stage and all stages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '项目看板', exact: true }).first().click();
  await expect(page.locator('[data-mobile-stage]')).toHaveCount(7);
  await expect(page.locator('#board .col:visible')).toHaveCount(6);
  await page.locator('[data-mobile-stage="design"]').click();
  await expect(page.locator('[data-mobile-stage="design"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#board .col:visible')).toHaveCount(1);
  await page.locator('[data-mobile-stage="all"]').click();
  await expect(page.locator('#board .col:visible')).toHaveCount(6);
});

test('mobile calendar toolbar keeps view and add controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '日历排期', exact: true }).first().click();
  const viewport = await page.evaluate(() => window.innerWidth);
  for (const selector of ['.calendar-view-switch', '#btn-add-schedule']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport + 1);
  }
  await page.locator('[data-cal-view="week"]').click();
  await expect(page.locator('#full-calendar')).toHaveClass(/week-mode/);
});

test('desktop calendar days support arrow-key selection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '日历排期', exact: true }).first().click();
  const selected = page.locator('.full-day.selected');
  await selected.focus();
  const initial = await selected.getAttribute('data-date');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => page.evaluate(() => document.activeElement?.getAttribute('data-date'))).not.toBe(initial);
  await expect(page.locator('.full-day.selected')).toHaveAttribute('tabindex', '0');
});

test('new project form keeps its submit action visible while the fields scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#btn-topbar-new').click();
  const submit = page.locator('#nc-ok');
  await expect(submit).toBeVisible();
  const viewport = await page.evaluate(() => window.innerHeight);
  const box = await submit.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(viewport);
  const body = await page.locator('#new-project-modal .form-modal-body').evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(body.scroll).toBeGreaterThan(body.client);
});

test('action desk filters work and count the visible queue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开行动台' }).click();
  await expect(page.locator('#action-desk-modal')).toBeVisible();
  const allCount = await page.locator('#action-desk-modal .action-item').count();
  expect(allCount).toBeGreaterThan(0);
  await page.locator('[data-action-desk-filter="action"]').click();
  await expect(page.locator('[data-action-desk-filter="action"]')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#action-desk-modal .action-item').count()).toBeLessThanOrEqual(allCount);
});

test('standalone dashboard gives the work area the full width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#dashboard-copilot')).toBeHidden();
  const pageBox = await page.locator('.dashboard-page').boundingBox();
  const caseBox = await page.locator('.case-overview-panel').boundingBox();
  expect(caseBox.width).toBeGreaterThan(pageBox.width - 100);
});

test('settings full page aligns its header with the cards', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-settings').click();
  await page.locator('#st-full').click();
  const header = await page.locator('#settings-modal h3').boundingBox();
  const section = await page.locator('#settings-modal .settings-section').first().boundingBox();
  expect(Math.abs(header.x - section.x)).toBeLessThanOrEqual(1);
});

test('1024 desktop dashboard keeps its two-column desktop layout', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const attention = await page.locator('.attention-panel').boundingBox();
  const calendar = await page.locator('.mini-calendar-panel').boundingBox();
  const cases = await page.locator('.case-overview-panel').boundingBox();
  expect(Math.abs(attention.y - calendar.y)).toBeLessThanOrEqual(2);
  expect(calendar.x).toBeGreaterThan(attention.x + attention.width);
  expect(cases.width).toBeGreaterThan(900);
});

test('the single create entry submits an iteration when the type is switched', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-topbar-new').click();
  await page.locator('#nc-title').fill('交互测试迭代');
  await page.locator('[data-create-kind="iteration"]').click();
  const created = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await page.locator('#nc-ok').click();
  const payload = await (await created).json();
  expect(payload.project.kind).toBe('iteration');
});

test('calendar month controls keep week and day views on the same period', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '日历排期', exact: true }).first().click();
  await page.locator('#cal-next').click();
  const month = Number(await page.locator('#cal-month').inputValue());
  await page.locator('[data-cal-view="week"]').click();
  const selected = await page.locator('.full-day.selected').getAttribute('data-date');
  expect(new Date(`${selected}T00:00:00`).getMonth()).toBe(month);
  await page.locator('[data-cal-view="day"]').click();
  await expect(page.locator('.full-day.selected')).toHaveAttribute('data-date', selected);
});

test('create modal follows the active language', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-settings').click();
  await page.locator('[data-settings-lang="en"]').click();
  await page.locator('#st-close').click();
  await page.locator('#btn-topbar-new').click();
  await expect(page.locator('#new-project-modal')).toContainText('New test project');
  await expect(page.locator('#nc-title-label')).toHaveText('Project name *');
  await page.locator('[data-create-kind="iteration"]').click();
  await expect(page.locator('#new-project-modal')).toContainText('New test iteration');
  await expect(page.locator('#nc-ok')).toHaveText('Create iteration');
});
