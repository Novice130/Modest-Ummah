import { defineConfig, devices } from '@playwright/test';
import { assertNotProduction } from './e2e/guard';

const baseURL = process.env.E2E_BASE_URL;

// Throws for production even on --list. A missing URL only fails when the test
// actually runs, so the suite can still be listed without any configuration.
if (baseURL) assertNotProduction(baseURL);

export default defineConfig({
  testDir: './e2e',
  // Each attempt places an order and a payment, so nothing runs twice or in parallel.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60_000,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
