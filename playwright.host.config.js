import { defineConfig, devices } from '@playwright/test';

const hostUrl = process.env.DSH_WEB_URL?.trim();
const hostVersion = process.env.DSH_HOST_VERSION?.trim();
const expectedHostVersion = 'dsh-v0.1.6-alpha.1';

if (!hostUrl || !hostVersion) {
  throw new Error(`Host smoke requires DSH_WEB_URL and DSH_HOST_VERSION=${expectedHostVersion}`);
}
if (hostVersion !== expectedHostVersion) {
  throw new Error(`Host smoke is pinned to ${expectedHostVersion}; received ${hostVersion}`);
}

try {
  new URL(hostUrl);
} catch {
  throw new Error(`DSH_WEB_URL must be an absolute URL: ${hostUrl}`);
}

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'dsh-host-compatibility.spec.js',
  fullyParallel: false,
  reporter: 'list',
  metadata: { dshHostVersion: hostVersion },
  use: {
    baseURL: hostUrl,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
