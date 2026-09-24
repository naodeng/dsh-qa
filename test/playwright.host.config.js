import { defineConfig, devices } from '@playwright/test';
import { parseHostLaunchUrl } from './support/dsh-host-auth.js';

const hostUrl = process.env.DSH_WEB_URL?.trim();
const hostVersion = process.env.DSH_HOST_VERSION?.trim();
const supportedHostVersions = new Set([
  'dsh-v0.1.7-alpha.1',
  'dsh-v0.1.7-rc.1',
]);
const expectedHostVersions = [...supportedHostVersions].join(' or ');

if (!hostUrl || !hostVersion) {
  throw new Error(`Host smoke requires DSH_WEB_URL and DSH_HOST_VERSION (${expectedHostVersions})`);
}
if (!supportedHostVersions.has(hostVersion)) {
  throw new Error(`Host smoke supports ${expectedHostVersions}; received ${hostVersion}`);
}

const { origin: hostOrigin } = parseHostLaunchUrl(hostUrl);

export default defineConfig({
  testDir: './e2e',
  testMatch: ['dsh-host-compatibility.spec.js', 'dsh-panel-lifecycle.spec.js'],
  fullyParallel: false,
  reporter: 'list',
  outputDir: './results/host-smoke',
  metadata: { dshHostVersion: hostVersion, dshHostOrigin: hostOrigin },
  use: {
    baseURL: hostOrigin,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
