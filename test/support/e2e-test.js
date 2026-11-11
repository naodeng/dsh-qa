import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  cleanupTestProjects: [async ({ request }, use) => {
    const before = await request.get('/api/projects');
    const projectIds = new Set((await before.json()).projects.map((project) => project.id));
    try {
      await use();
    } finally {
      const after = await request.get('/api/projects');
      const projects = (await after.json()).projects;
      for (const project of projects) {
        if (!projectIds.has(project.id)) await request.delete(`/api/projects/${encodeURIComponent(project.id)}`);
      }
    }
  }, { auto: true }],
});
