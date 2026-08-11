import { defineConfig, devices } from '@playwright/test'

const webUrl = 'http://127.0.0.1:4347'
const browserExecutablePath = process.env.E2E_CHROME_PATH

export default defineConfig({
  testDir: './e2e',
  testMatch: 'bank-statement-storage-loopback.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webUrl,
    channel: browserExecutablePath ? undefined : 'chrome',
    launchOptions: browserExecutablePath
      ? { executablePath: browserExecutablePath }
      : {},
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/bank-statement-storage-loopback-harness.mjs',
    url: `${webUrl}/auth/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
