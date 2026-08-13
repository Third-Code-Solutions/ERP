import { expect, test } from '@playwright/test'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_MUTATION = process.env.E2E_MAGIC_LINK_MUTATION === '1'
const SEEDED_OPPORTUNITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEMO_REQUESTED_BY = 'Somnus Studios'
const DEMO_DESCRIPTION =
  process.env.E2E_CHANGE_REQUEST_DESCRIPTION ??
  'Demo tenant design review: verify notification completion on final issue.'
const DEMO_RESOLUTION = 'Demo tenant design review confirmed for final issue.'
const ACTION_TIMEOUT = 30_000

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

test.describe('ABI OPS client change-request mutation', () => {
  test.skip(
    !RUN_MUTATION,
    'Set E2E_MAGIC_LINK_MUTATION=1 only for the dedicated demo-tenant production proof.',
  )

  test('creates, replays, and resolves one demo-tenant request without duplication', async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000)
    const baseUrl = testInfo.project.use.baseURL!
    const auth = await authenticateRole(page.context(), baseUrl, 'admin')
    const errors: string[] = []
    const missingResources: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() === 404) missingResources.push(response.url())
    })

    const route = `/crm/opportunities/${SEEDED_OPPORTUNITY}/proposal/change-requests`

    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Change requests' })).toBeVisible()

      const requestRows = () =>
        page.locator('tbody tr').filter({ hasText: DEMO_DESCRIPTION })
      let rows = requestRows()
      let originalKey: string | undefined

      if (await rows.count() === 0) {
        originalKey = await page.locator('input[name="idempotency_key"]').inputValue()
        await page.getByLabel('Requested by (client name)').fill(DEMO_REQUESTED_BY)
        await page.getByLabel('Description').fill(DEMO_DESCRIPTION)
        await page.getByRole('button', { name: 'Log change request' }).click()
        await expect(page.getByText('Change request logged. Design has been notified.')).toBeVisible({
          timeout: ACTION_TIMEOUT,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
      }

      rows = requestRows()
      await expect(rows).toHaveCount(1)

      if (originalKey) {
        await page.getByLabel('Requested by (client name)').fill(DEMO_REQUESTED_BY)
        await page.getByLabel('Description').fill(DEMO_DESCRIPTION)
        await page.locator('input[name="idempotency_key"]').evaluate((element, key) => {
          const input = element as HTMLInputElement
          input.value = String(key)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }, originalKey)
        await page.getByRole('button', { name: 'Log change request' }).click()
        await expect(page.getByText('Change request logged. Design has been notified.')).toBeVisible({
          timeout: ACTION_TIMEOUT,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(requestRows()).toHaveCount(1)
      }

      const row = requestRows()
      const resolveButton = row.getByRole('button', { name: 'Resolve request' })
      if (await resolveButton.count() > 0) {
        await row.getByLabel('Resolution note').fill(DEMO_RESOLUTION)
        await resolveButton.click()
        await expect(row.getByText('Resolved', { exact: true })).toBeVisible({
          timeout: ACTION_TIMEOUT,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
      }

      const resolvedRow = requestRows()
      await expect(resolvedRow).toHaveCount(1)
      await expect(resolvedRow.getByText('Resolved', { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT,
      })
      await expect(resolvedRow.getByText('Logged', { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT,
      })
      expect(missingResources, missingResources.join('\n')).toEqual([])
      expect(errors, errors.join('\n')).toEqual([])
      expect(await page.locator('body').textContent()).not.toContain('Third Code')
    } finally {
      await auth.cleanup()
      await page.context().clearCookies()
    }
  })
})
