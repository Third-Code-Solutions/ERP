import type { Page, Response } from '@playwright/test'

const LOGIN_NAV_RETRIES = 4

export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_USER_EMAIL ?? 'test@buildops.local'
  const password = process.env.E2E_USER_PASSWORD ?? 'testpassword123'

  let response: Response | null = null
  for (let attempt = 1; attempt <= LOGIN_NAV_RETRIES; attempt++) {
    response = await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
    const status = response?.status() ?? 0
    // Next.js dev server can flap to 404 during /_not-found recompiles. Retry.
    if (status >= 200 && status < 400) {
      const title = await page.title().catch(() => '')
      if (!title.toLowerCase().startsWith('404:')) break
    }
    if (attempt < LOGIN_NAV_RETRIES) await page.waitForTimeout(1500)
  }

  await page.waitForLoadState('networkidle')

  const emailInput = page.locator('input[type="email"]')
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 })
  await emailInput.fill(email)
  await page.locator('input[type="password"]').fill(password)

  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ])
}
