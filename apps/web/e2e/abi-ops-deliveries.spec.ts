import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Deliveries', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('deliveries index loads with heading and table-or-empty state', async ({
    page,
  }) => {
    const response = await page.goto('/procurement/deliveries', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1').first()).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).toContain('deliveries')

    const tableCount = await page.locator('table').count()
    const hasEmptyState =
      body.includes('no deliveries') ||
      body.includes('nothing scheduled') ||
      body.includes('no scheduled deliveries')

    expect(tableCount > 0 || hasEmptyState).toBe(true)
  })

  test('deliveries new form renders PO selector and scheduled_date input', async ({
    page,
  }) => {
    const response = await page.goto('/procurement/deliveries/new', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    await expect(page.locator('h1').first()).toBeVisible()

    // PO selector — match by name, id, aria-label, or label text
    const poSelector = page
      .locator(
        'select[name*="po" i], [name*="purchase_order" i], [aria-label*="PO" i], [aria-label*="Purchase order" i]'
      )
      .first()
    const poLabelHit = await page
      .locator('label', { hasText: /purchase\s*order|^\s*po\s*$/i })
      .count()
    expect((await poSelector.count()) > 0 || poLabelHit > 0).toBe(true)

    // scheduled_date input
    const dateInput = page
      .locator(
        'input[name="scheduled_date"], input[name*="scheduled" i][type="date"], input[type="date"]'
      )
      .first()
    await expect(dateInput).toBeVisible()
  })
})
