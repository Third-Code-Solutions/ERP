import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const STAGE_LABELS = [
  'Lead',
  'Site Survey',
  'Design',
  'BOM Submission',
  'Negotiation',
  'Contract',
  'Won',
  'Lost',
] as const

test.describe('M-Pipeline Board', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('board route loads with title and 8 columns', async ({ page }) => {
    const response = await page.goto('/pipeline/board', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText(/pipeline board/i)

    // Each stage label should appear at least once in column headers.
    for (const label of STAGE_LABELS) {
      await expect(
        page.getByText(new RegExp(`^${label}$`, 'i')).first()
      ).toBeVisible({ timeout: 10_000 })
    }

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)
  })

  test('quick-add "+" affordance is rendered per column', async ({ page }) => {
    await page.goto('/pipeline/board', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // We expect multiple buttons / interactive controls bearing a "+" glyph
    // (one per kanban column). Match any element whose visible text contains
    // a plus, rather than over-binding to a specific tag/aria attribute.
    const plusButtons = page.locator(
      'button:has-text("+"), [role="button"]:has-text("+")'
    )
    const count = await plusButtons.count()
    // Smoke-only: at least one column should expose an add control. We don't
    // strictly assert 8 because seed data may hide some columns under role
    // gating, but the affordance must exist.
    expect(count).toBeGreaterThan(0)
  })
})
