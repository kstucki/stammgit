import { defineConfig, devices } from '@playwright/test';

const port = 18988;
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // The isolated local save target is shared by these smoke tests.
  retries: 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/snapshots/{testFilePath}/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node scripts/serve-test.mjs',
    url: `http://127.0.0.1:${port}/login.html`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { STAMMGIT_TEST_PORT: String(port) },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
