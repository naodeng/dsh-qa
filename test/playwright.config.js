import { defineConfig, devices } from '@playwright/test';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const requestedPort = Number.parseInt(process.env.QA_E2E_PORT || '', 10);
const e2ePort = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await new Promise((resolvePort, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close((error) => error ? reject(error) : resolvePort(port));
  });
});
process.env.QA_E2E_PORT = String(e2ePort);

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './support/cleanup-e2e-data.js',
  testIgnore: ['**/dsh-host-compatibility.spec.js', '**/dsh-panel-lifecycle.spec.js'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    cwd: repoRoot,
    command: `node -e "import('node:fs').then(({ rmSync }) => rmSync('test/.data/e2e', { recursive: true, force: true }))" && QA_PORT=${e2ePort} QA_DATA_DIR=test/.data/e2e node test/support/e2e-server.js`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
