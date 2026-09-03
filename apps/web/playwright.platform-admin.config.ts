import { defineConfig, devices } from '@playwright/test'

const browserExecutablePath = process.env.E2E_CHROME_PATH

export default defineConfig({
  testDir: './e2e',
  testMatch: ['platform-admin-loopback.spec.ts', 'route-sweep-loopback.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTeardown: './e2e/platform-admin-loopback-teardown.mjs',
  timeout: 120_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4417',
    channel: browserExecutablePath ? undefined : 'chrome',
    launchOptions: browserExecutablePath ? { executablePath: browserExecutablePath } : {},
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/platform-admin-loopback-harness.mjs',
    url: 'http://127.0.0.1:4417/auth/login',
    reuseExistingServer: process.env.PLATFORM_BROWSER_REUSE === 'true',
    timeout: 120_000,
  },
})
