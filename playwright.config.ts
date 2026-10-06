import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.STAMMGIT_TEST_PORT || 18988);

const specs = (...names: string[]) => names.map(name => `**/${name}.spec.ts`);
const narrowSpecs = specs('responsive-layout', 'archive-menu', 'welcome', 'source-layout', 'editor-layout');
const phoneSpecs = [...narrowSpecs, ...specs('graph-expansion', 'graph-camera', 'person-info-camera', 'start-zoom',
  'ancestor-fan', 'chronicle-presentation', 'chronicle-design', 'archive',
  'source-language', 'source-categories', 'gedcom-export')];

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
    locale: 'de-CH', // Existing fixtures start in German; language tests override this.
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Desktop runs every spec. Phones repeat only specs with touch or phone
  // layout behaviour; the narrow width guards against horizontal overflow.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'] }, testMatch: phoneSpecs },
    { name: 'narrow', use: { ...devices['iPhone 13'], viewport: { width: 360, height: 740 } }, testMatch: narrowSpecs },
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
