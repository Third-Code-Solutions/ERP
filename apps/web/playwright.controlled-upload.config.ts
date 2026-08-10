import { defineConfig, devices } from '@playwright/test'

const webUrl = 'http://127.0.0.1:4327'
const authUrl = 'http://127.0.0.1:4328'
const browserExecutablePath = process.env.E2E_CHROME_PATH

export default defineConfig({
  testDir: './e2e',
  testMatch: 'documents-upload-controlled.spec.ts',
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
    command: 'node e2e/cortex-route-loopback-harness.mjs',
    url: `${authUrl}/__harness__/ready`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
