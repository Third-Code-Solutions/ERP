import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Progress claims', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('claims index renders heading, KPI cards, and PC- badge/stepper', async ({
    page,
  }) => {
    const response = await page.goto('/claims', { waitUntil: 'domcontentloaded' })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    await expect(page.locator('h1').first()).toBeVisible()

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).toMatch(/progress\s+claims?|claims/i)

    // 4 KPI labels must all appear somewhere on the page
    const kpis = ['draft', 'in review', 'awaiting payment', 'paid this month']
    for (const label of kpis) {
      expect(body, `KPI "${label}" missing from /claims`).toContain(label)
    }

    // Stepper-or-PC badge: either an element containing "PC-" prefix, or a
    // stepper/progress component exists, or the empty-state mentions it.
    const hasPcPrefix = body.includes('pc-')
    const stepperCount = await page
      .locator('[role="progressbar"], [data-stepper], [class*="stepper" i], ol[class*="step" i]')
      .count()
    expect(hasPcPrefix || stepperCount > 0).toBe(true)
  })

  test('claims new form renders project picker, milestone %, and amount', async ({
    page,
  }) => {
    const response = await page.goto('/claims/new', { waitUntil: 'domcontentloaded' })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    await expect(page.locator('h1').first()).toBeVisible()

    const projectField = page
      .locator(
        'select[name*="project" i], [name*="project_id" i], [aria-label*="Project" i]'
      )
      .first()
    const projectLabelHit = await page
      .locator('label', { hasText: /project/i })
      .count()
    expect((await projectField.count()) > 0 || projectLabelHit > 0).toBe(true)

    const milestoneField = page
      .locator(
        'input[name*="milestone" i], input[name*="percent" i], input[name*="percentage" i]'
      )
      .first()
    await expect(milestoneField).toBeVisible()

    const amountField = page
      .locator('input[name*="amount" i], input[type="number"][name*="value" i]')
      .first()
    await expect(amountField).toBeVisible()
  })
})
