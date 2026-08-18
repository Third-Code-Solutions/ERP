import { defineConfig, devices } from '@playwright/test'

const chromeExecutablePath = process.env.E2E_CHROME_PATH
const vercelProtectionBypassSecret =
  process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(vercelProtectionBypassSecret
      ? {
          // Keep Vercel Authentication enabled while allowing the dedicated
          // trusted-PR test job to exercise its isolated preview deployment.
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': vercelProtectionBypassSecret,
            // Exclude Vercel's preview-only toolbar from console assertions.
            // The toolbar is an external overlay and is not part of ABI OPS.
            'x-vercel-skip-toolbar': '1',
          },
        }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromeExecutablePath
          ? { launchOptions: { executablePath: chromeExecutablePath } }
          : {}),
      },
    },
  ],
})
