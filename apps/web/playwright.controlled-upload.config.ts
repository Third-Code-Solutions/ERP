import { defineConfig, devices } from '@playwright/test'

const webUrl = 'http://127.0.0.1:4327'
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
    // The harness opens its auth fixture before Next is ready. Wait for the
    // actual Web origin so the first controlled navigation cannot race startup.
    url: webUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
