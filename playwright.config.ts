import { defineConfig } from '@playwright/test';
// The remote site is an installation guide; scanner tests must stay local.
const external = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  testMatch: external ? 'site.spec.ts' : 'lab.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: external || 'http://127.0.0.1:4173',
    headless: true,
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run dev -- --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
      },
  reporter: [['list'], ['html', { open: 'never' }]],
});
