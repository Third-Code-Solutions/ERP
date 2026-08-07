import { defineConfig, devices } from '@playwright/test'

const galleryUrl = 'http://127.0.0.1:4317'
const browserExecutablePath = process.env.E2E_CHROME_PATH

export default defineConfig({
  testDir: './e2e',
  testMatch: 'cortex-semantic-index-local.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: galleryUrl,
    channel: browserExecutablePath ? undefined : 'chrome',
    launchOptions: browserExecutablePath
      ? { executablePath: browserExecutablePath }
      : {},
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'vite --config e2e/component-gallery/vite.config.ts --host 127.0.0.1 --port 4317 --strictPort',
    url: galleryUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
