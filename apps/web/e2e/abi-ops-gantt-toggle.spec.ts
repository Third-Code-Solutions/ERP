import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const PROJECT_ID = process.env.E2E_PROJECT_ID ?? ''

test.describe('M-Gantt toggle', () => {
  test('progress?view=gantt renders SVG timeline', async ({ page }) => {
    test.skip(
      PROJECT_ID.length === 0,
      'No E2E_PROJECT_ID provided; cannot probe project-scoped Gantt view.'
    )

    await login(page)

    const response = await page.goto(
      `/projects/${PROJECT_ID}/progress?view=gantt`,
      { waitUntil: 'domcontentloaded' }
    )
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    await expect(page.locator('h1').first()).toBeVisible()

    // Gantt views render as SVG (timeline bars are <rect>s inside <svg>).
    const svg = page.locator('svg').first()
    await expect(svg).toBeVisible({ timeout: 10_000 })
  })
})
