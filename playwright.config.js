import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8899',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: "node -e \"import('node:fs').then(({ rmSync }) => rmSync('test/.data/e2e', { recursive: true, force: true }))\" && QA_DATA_DIR=test/.data/e2e node server/cli.js",
    url: 'http://127.0.0.1:8899',
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
