import { test, expect } from '../support/e2e-test.js';

test('首页仅在纯示例数据时提供清理入口，取消后可确认清理', async ({ page }) => {
  const board = await (await page.request.get('/api/board')).json();
  const sampleParentId = board.projects.find((item) => item.isSample && item.kind !== 'iteration').id;
  for (const project of board.projects.filter((item) => !item.isSample)) {
    await page.request.delete(`/api/projects/${encodeURIComponent(project.id)}`);
  }

  await page.goto('/');
  const notice = page.locator('#sample-data-notice');
  await expect(notice).toBeVisible();

  await page.locator('#btn-clear-sample-data').click();
  let dialog = page.locator('#modal-root .modal');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(notice).toBeVisible();
  expect((await (await page.request.get('/api/board')).json()).projects).toHaveLength(2);

  const created = await page.request.post('/api/projects', {
    data: { title: '真实工作项目', createWorkspace: false },
  });
  expect(created.ok()).toBe(true);
  const project = (await created.json()).project;
  await expect(notice).toBeHidden();

  const blocked = await page.request.delete('/api/sample-data');
  expect(blocked.status()).toBe(409);
  await page.request.delete(`/api/projects/${encodeURIComponent(project.id)}`);
  await expect(notice).toBeVisible();

  const iterationResponse = await page.request.post('/api/projects', {
    data: { title: '用户正在推进的迭代', kind: 'iteration', parentId: sampleParentId, createWorkspace: false },
  });
  expect(iterationResponse.ok()).toBe(true);
  const iteration = (await iterationResponse.json()).project;
  await expect(notice).toBeHidden();
  expect((await page.request.delete('/api/sample-data')).status()).toBe(409);
  await page.request.delete(`/api/projects/${encodeURIComponent(iteration.id)}`);
  await expect(notice).toBeVisible();

  await page.locator('#btn-clear-sample-data').click();
  dialog = page.locator('#modal-root .modal');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '清理示例数据', exact: true }).click();
  await expect(notice).toBeHidden();
  expect((await (await page.request.get('/api/board')).json()).projects).toHaveLength(0);
});
