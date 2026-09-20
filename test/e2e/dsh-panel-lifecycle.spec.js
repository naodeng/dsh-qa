import { test, expect } from '@playwright/test';
import { authenticateHostPage, parseHostLaunchUrl } from '../support/dsh-host-auth.js';

const hostVersion = process.env.DSH_HOST_VERSION;
const { launchUrl } = parseHostLaunchUrl(process.env.DSH_WEB_URL);
const WORKBENCH_IFRAME = 'iframe[src*="/api/dsh-qa/workbench"]';
const QA_PANEL = { name: '质量工作台', exact: true };

test.describe('dsh-qa native Panel lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'harness-version', description: hostVersion });
    await authenticateHostPage(page, launchUrl);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    try {
      await testInfo.attach('native-panel-failure.png', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } catch {
      // Playwright keeps the trace when failure happens before a page exists.
    }
  });

  test('keeps one iframe across Panel selection, popout, close, return message and host reload', async ({ page, context }) => {
    const qaPanel = page.getByRole('button', QA_PANEL);
    await expect(qaPanel).toHaveCount(1);
    await qaPanel.click();
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);
    await expect(page.locator(WORKBENCH_IFRAME)).toBeVisible();

    // Re-selecting the active Panel must not mount a second main-slot entry.
    await qaPanel.click();
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);

    const panelList = page.locator('nav').filter({ has: page.locator('button[aria-label="质量工作台"]') });
    const otherPanels = panelList.locator('button[aria-label]').filter({ hasNotText: '质量工作台' });
    if (await otherPanels.count()) {
      await otherPanels.first().click();
      await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(0);
      await qaPanel.click();
      await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);
    } else {
      test.info().annotations.push({
        type: 'host-limitation',
        description: 'Harness composition exposed no second global Panel; close-to-Conversation was used for the return path.',
      });
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(0);
      await qaPanel.click();
      await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);
    }

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: '在标签页打开', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/api\/dsh-qa\/workbench\/?$/);
    await popup.close();
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);

    const workbenchFrame = page.frames().find((frame) => frame.url().includes('/api/dsh-qa/workbench/'));
    if (!workbenchFrame) throw new Error('Workbench iframe frame is not available');
    await workbenchFrame.evaluate(() => {
      window.parent.postMessage({ source: 'dsh-qa', type: 'close-panel' }, window.location.origin);
    });
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(0);

    // A full host reload exercises the plugin fiber unload and fresh slot registration.
    await page.reload();
    await expect(page.getByRole('button', QA_PANEL)).toHaveCount(1);
    await page.getByRole('button', QA_PANEL).click();
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', QA_PANEL)).toHaveCount(1);
    await expect(page.locator(WORKBENCH_IFRAME)).toHaveCount(0);

    // The popup was closed and host reload did not leave a live duplicate page.
    expect(context.pages().filter((candidate) => !candidate.isClosed())).toHaveLength(1);
  });
});
