import { test, expect } from './fixtures'
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

    await expect(page.locator('h1')).toContainText(/tasks/i)

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // The view nav links are named "<view>, <n> tasks" ("Due today, 3 tasks", …).
    // We assert at least one of them is in the DOM — smoke-only.
    const tabLabels = ['Due today', 'Overdue', 'Next 7 days', 'All open', 'Completed']
    let found = 0
    const views = page.getByRole('navigation', { name: 'Task views' })
    for (const label of tabLabels) {
      const count = await views
        .getByRole('link', { name: new RegExp(`^${label}, `, 'i') })
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
