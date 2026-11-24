import { expect, type Page } from '../base-test'

const FLAG_OFF = 'ERP_TENANCY_ENABLED is off on this deployment'

/**
 * Opens /settings/tax and returns why the view is unavailable, or null once it shows.
 * With ERP_TENANCY_ENABLED off the page is a 404, or, when notFound() runs after the
 * settings loading shell has streamed, an HTTP 200 whose not-found view appears only
 * after hydration. A redirect away means the user lacks finance.read.
 */
export async function openTaxSettings(page: Page): Promise<string | null> {
  const response = await page.goto('/settings/tax', { waitUntil: 'domcontentloaded' })
  if (response?.status() === 404) return FLAG_OFF
  const notFound = page.getByRole('heading', { level: 1, name: 'We could not find that workspace record', exact: true })
  const view = page.getByRole('heading', { level: 1, name: 'Tax rates', exact: true })
  const elsewhere = () => new URL(page.url()).pathname !== '/settings/tax'
  await expect
    .poll(async () => elsewhere() || (await notFound.isVisible()) || (await view.isVisible()), {
      message: '/settings/tax showed neither the tax rates view nor the not-found view',
      timeout: 15_000,
    })
    .toBe(true)
  if (elsewhere()) return 'User lacks finance.read'
  return (await notFound.isVisible()) ? FLAG_OFF : null
}
