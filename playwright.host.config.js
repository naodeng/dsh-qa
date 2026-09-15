import { defineConfig, devices } from '@playwright/test';
import { parseHostLaunchUrl } from './test/support/dsh-host-auth.js';

const hostUrl = process.env.DSH_WEB_URL?.trim();
const hostVersion = process.env.DSH_HOST_VERSION?.trim();
const expectedHostVersion = 'dsh-v0.1.6-alpha.1';

if (!hostUrl || !hostVersion) {
  throw new Error(`Host smoke requires DSH_WEB_URL and DSH_HOST_VERSION=${expectedHostVersion}`);
}
if (hostVersion !== expectedHostVersion) {
  throw new Error(`Host smoke is pinned to ${expectedHostVersion}; received ${hostVersion}`);
}

const { origin: hostOrigin } = parseHostLaunchUrl(hostUrl);

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'dsh-host-compatibility.spec.js',
  fullyParallel: false,
  reporter: 'list',
  metadata: { dshHostVersion: hostVersion, dshHostOrigin: hostOrigin },
  use: {
    baseURL: hostOrigin,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
