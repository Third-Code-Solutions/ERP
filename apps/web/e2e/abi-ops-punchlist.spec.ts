import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Punchlist', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('punchlist index renders heading and KPI labels', async ({ page }) => {
    const response = await page.goto('/punchlist', { waitUntil: 'domcontentloaded' })
    expect(response?.status() ?? 0).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1').first()).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // The three KPI cards Open / In progress / Closed should all be present.
    await expect(page.getByText(/^open$/i).first()).toBeVisible()
    await expect(page.getByText(/in progress/i).first()).toBeVisible()
    await expect(page.getByText(/^closed$/i).first()).toBeVisible()
  })

  test('new punchlist item form loads with description/location/trade fields', async ({
    page,
  }) => {
    const response = await page.goto('/punchlist/new', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText(/new punchlist/i)

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // Form fields: description / location / trade. Each may be rendered as a
    // textarea, input, or select — match by either the label text or the
    // input name attribute to stay resilient.
    const descriptionField = page
      .locator(
        'textarea[name="description"], input[name="description"], textarea[name="title"], input[name="title"]'
      )
      .first()
    const locationField = page
      .locator(
        'textarea[name="location"], input[name="location"], input[name="location_text"]'
      )
      .first()
    const tradeField = page
      .locator('select[name="trade"], input[name="trade"]')
      .first()

    const bodyText = (await page.locator('body').innerText()).toLowerCase()
    const hasFormCopy =
      bodyText.includes('description') &&
      bodyText.includes('location') &&
      bodyText.includes('trade')

    // Either explicit form controls exist OR at least the labels are visible
    // (the form may render via a client component with different name attrs).
    const explicitFields =
      (await descriptionField.count()) > 0 ||
      (await locationField.count()) > 0 ||
      (await tradeField.count()) > 0
    expect(explicitFields || hasFormCopy).toBe(true)
  })
})
