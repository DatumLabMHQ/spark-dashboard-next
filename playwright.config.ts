// Smoke test for this dashboard. CI builds it, starts it and runs tests/smoke.spec.ts; locally,
// `npm run test:smoke` against a running dev server (BASE_URL overrides the port).
import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:3030';
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, viewport: { width: 1360, height: 900 }, trace: 'retain-on-failure' },
  webServer: process.env.CI ? { command: 'npm start -- -p 3030', url: baseURL, reuseExistingServer: false, timeout: 120_000 } : undefined,
});
