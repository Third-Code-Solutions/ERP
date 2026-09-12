import { expect, type Page } from '@playwright/test'

export async function assertAuthenticatedSmokeReady(
  page: Page,
  baseUrl: string,
  requestedRoute: string,
  timeoutMs = 15_000,
): Promise<void> {
  const expected = new URL(requestedRoute, baseUrl)
  const normalizedPath = (path: string) => path.replace(/\/+$/, '') || '/'
  // This is the only canonical redirect in the current smoke inventory.
  // It preserves incoming query values and explicitly selects list view.
  if (normalizedPath(expected.pathname) === '/pipeline/list') {
    expected.pathname = '/pipeline'
    expected.searchParams.set('view', 'list')
  }
  await expect.poll(async () => {
    const actual = new URL(page.url())
    const path = normalizedPath(actual.pathname)
    const correctQuery = [...expected.searchParams.keys()].every(key =>
      JSON.stringify(actual.searchParams.getAll(key)) ===
      JSON.stringify(expected.searchParams.getAll(key)),
    )
    return actual.origin === new URL(baseUrl).origin &&
      path !== '/auth' && !path.startsWith('/auth/') &&
      path === normalizedPath(expected.pathname) && correctQuery &&
      await page.locator('main#main-content').isVisible()
  }, {
    timeout: timeoutMs,
    message: `${requestedRoute} must reach its authenticated destination and visible workspace landmark`,
  }).toBe(true)
}
