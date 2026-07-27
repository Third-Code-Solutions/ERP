import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const PROJECT_ID = process.env.E2E_PROJECT_ID ?? ''

test.describe('M-Project access', () => {
  test('access page renders client-links heading or guards with 403', async ({
    page,
  }) => {
    test.skip(
      PROJECT_ID.length === 0,
      'No E2E_PROJECT_ID provided; cannot probe project-scoped access page.'
    )

    await login(page)

    const response = await page.goto(`/projects/${PROJECT_ID}/access`, {
      waitUntil: 'domcontentloaded',
    })
    const status = response?.status() ?? 0

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // Accept either: (a) admin-authorised view with heading visible, or
    // (b) a 403 / redirect to a forbidden state if the seed user is non-admin.
    if (status === 403) {
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(
        body.includes('forbidden') ||
          body.includes('not authorised') ||
          body.includes('not authorized') ||
          body.includes('access denied')
      ).toBe(true)
      return
    }

    expect(status).toBeLessThan(400)

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()

    const headingText = (await heading.textContent())?.toLowerCase() ?? ''
    const body = (await page.locator('body').innerText()).toLowerCase()

    const hasExpectedHeading =
      /client\s+links?|access/.test(headingText) ||
      body.includes('client link') ||
      body.includes('access')

    expect(hasExpectedHeading).toBe(true)
  })
})
