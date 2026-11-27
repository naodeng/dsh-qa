import { test, expect } from '../support/e2e-test.js';

const pages = [
  ['dashboard', null],
  ['board', '项目看板'],
  ['calendar', '日历排期'],
  ['skills', 'QA Skills'],
];

test('v6 desktop shell keeps its 1440 layout contract', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const contract = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      topbar: rect('#topbar').height,
      navLabel: style('.top-nav .nav-item span').display,
      copilot: style('#dashboard-copilot').display,
      attention: rect('.attention-panel'),
      calendar: rect('.mini-calendar-panel'),
      cases: rect('.case-overview-panel'),
      body: document.body.scrollWidth,
      viewport: innerWidth,
    };
  });
  expect(contract.topbar).toBe(60);
  expect(contract.navLabel).not.toBe('none');
  expect(contract.copilot).toBe('none');
  expect(Math.abs(contract.attention.y - contract.calendar.y)).toBeLessThanOrEqual(2);
  expect(contract.calendar.x).toBeGreaterThan(contract.attention.x + contract.attention.width);
  expect(contract.cases.width).toBeGreaterThan(1200);
  expect(contract.body).toBeLessThanOrEqual(contract.viewport);
});

test('v6 1024 desktop keeps the two-column dashboard and readable board cards', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '视觉契约项目', createWorkspace: false } });
  expect(created.ok()).toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const dashboard = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    return { attention: rect('.attention-panel'), calendar: rect('.mini-calendar-panel'), cases: rect('.case-overview-panel'), nav: getComputedStyle(document.querySelector('.top-nav .nav-item span')).display };
  });
  expect(dashboard.nav).not.toBe('none');
  expect(Math.abs(dashboard.attention.y - dashboard.calendar.y)).toBeLessThanOrEqual(2);
  expect(dashboard.calendar.x).toBeGreaterThan(dashboard.attention.x + dashboard.attention.width);
  expect(dashboard.cases.width).toBeGreaterThan(900);

  await page.getByRole('button', { name: '项目看板', exact: true }).first().click();
  const board = await page.evaluate(() => {
    const card = document.querySelector('#board .card');
    const col = document.querySelector('#board .col');
    return { cardTitle: getComputedStyle(card.querySelector('.card-title')).fontSize, cursor: getComputedStyle(card).cursor, colWidth: col.getBoundingClientRect().width, emptyHint: document.querySelector('.empty-col small')?.textContent };
  });
  expect(board.cardTitle).toBe('13px');
  expect(board.cursor).toBe('grab');
  expect(board.colWidth).toBeGreaterThanOrEqual(209);
  expect(board.emptyHint).toContain('拖动卡片');
});

test('v6 calendar keeps the month, active view and side summary visible at 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: '日历排期', exact: true }).first().click();
  const contract = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.full-day')].at(-1)?.getBoundingClientRect();
    const active = getComputedStyle(document.querySelector('[data-cal-view].active'));
    return { lastBottom: last?.bottom, viewport: innerHeight, activeBg: active.backgroundColor, summary: document.querySelector('#calendar-month-summary')?.textContent };
  });
  expect(contract.lastBottom).toBeLessThanOrEqual(contract.viewport);
  expect(contract.activeBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(contract.summary).toContain('本月概览');
});

test('v6 assistant typography and touch targets stay aligned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('[data-view-jump="assistant"]:visible').first().click();
  const desktop = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('#chat-head-title')).fontSize,
    mode: getComputedStyle(document.querySelector('.chat-mode-label')).fontSize,
    modelHeight: document.querySelector('.model-switch').getBoundingClientRect().height,
    input: getComputedStyle(document.querySelector('#chat-input')).fontSize,
  }));
  expect(desktop.title).toBe('20px');
  expect(desktop.mode).toBe('11px');
  expect(desktop.modelHeight).toBe(32);
  expect(desktop.input).toBe('12.5px');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.locator('.model-switch').evaluate((element) => element.getBoundingClientRect().height)).toBe(44);
});

test('v6 pages do not overflow at desktop, tablet or phone widths', async ({ page }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const [name, label] of pages) {
      if (label) {
        await page.getByRole('button', { name: label, exact: true }).first().click();
        await page.waitForTimeout(200);
      }
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      expect(overflow, `${name} at ${width}`).toBeLessThanOrEqual(width);
    }
  }
});
