import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const PROJECT_ID = process.env.E2E_PROJECT_ID ?? ''

test.describe('M-Weekly report', () => {
  test('project reports surface a generate-CTA for the current week', async ({
    page,
  }) => {
    test.skip(
      PROJECT_ID.length === 0,
      'No E2E_PROJECT_ID provided; cannot probe project-scoped weekly reports.'
    )

    await login(page)

    const response = await page.goto(`/projects/${PROJECT_ID}/reports`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    await expect(page.locator('h1').first()).toBeVisible()

    // CTA copy is the canonical entry into weekly-report generation.
    const cta = page
      .getByRole('button', { name: /generate.*this week/i })
      .or(page.getByRole('link', { name: /generate.*this week/i }))
      .or(page.locator('text=/generate this week.?s report/i'))
      .first()

    await expect(cta).toBeVisible({ timeout: 10_000 })
  })
})
