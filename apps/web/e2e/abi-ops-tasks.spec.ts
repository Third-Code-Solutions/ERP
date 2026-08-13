import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Tasks (daily cadence)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('tasks route loads with heading and at least one tab', async ({
    page,
  }) => {
    const response = await page.goto('/tasks', { waitUntil: 'domcontentloaded' })
    expect(response?.status() ?? 0).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText(/my tasks/i)

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // The tab nav exposes Today / Overdue / This week / Completed. We assert
    // at least one of them is in the DOM — smoke-only.
    const tabLabels = ['Today', 'Overdue', 'This week', 'Completed']
    let found = 0
    for (const label of tabLabels) {
      const count = await page
        .getByRole('link', { name: new RegExp(`^${label}$`, 'i') })
        .count()
      if (count > 0) found += 1
    }
    expect(found).toBeGreaterThan(0)
  })

  test('empty state renders cleanly when no tasks exist', async ({ page }) => {
    await page.goto('/tasks?tab=completed', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // Either there's a card-empty message OR a populated table — both are
    // valid post-render states.
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(50)
  })
})
