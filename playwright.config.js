import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4174'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    colorScheme: 'light',
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-wide', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-compact', use: { viewport: { width: 1041, height: 1001 } } },
  ],
  webServer: {
    command: 'PORT=4174 HOST=127.0.0.1 npm run offline',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
