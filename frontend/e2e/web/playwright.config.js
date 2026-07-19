import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../..');
const root = path.resolve(frontend, '..');
const startServers = process.env.SVBK_E2E_START_SERVERS === '1';
const baseURL = process.env.SVBK_E2E_BASE_URL || 'http://127.0.0.1:5173/app/';

export default defineConfig({
  testDir: here,
  outputDir: path.join(here, 'test-results'),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(here, 'playwright-report'), open: 'never' }],
    ['junit', { outputFile: path.join(here, 'test-results/results.xml') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet-chromium', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: startServers ? [
    {
      command: './.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: path.join(root, 'backend'),
      url: 'http://127.0.0.1:8000/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        ENVIRONMENT: 'test',
        SVBK_SKIP_STARTUP_TASKS: '1',
        DATABASE_URL: process.env.SVBK_TEST_DATABASE_URL || '',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: frontend,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ] : undefined,
});
