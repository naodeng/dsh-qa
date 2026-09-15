import { defineConfig, devices } from '@playwright/test';

const requestedPort = Number.parseInt(process.env.QA_E2E_PORT || process.env.QA_PORT || '8899', 10);
const e2ePort = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8899;

export default defineConfig({
  testDir: './test/e2e',
  testIgnore: ['**/dsh-host-compatibility.spec.js'],
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `node -e "import('node:fs').then(({ rmSync }) => rmSync('test/.data/e2e', { recursive: true, force: true }))" && QA_PORT=${e2ePort} QA_DATA_DIR=test/.data/e2e node server/cli.js`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
