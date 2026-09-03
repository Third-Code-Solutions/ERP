import { expect, test } from '@playwright/test'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const PRODUCTION_ALIAS = 'https://thirdcode-erp.vercel.app'
const PRODUCTION_SUPABASE_HOST = 'aqqrtkmtcsfkbyyqxowv.supabase.co'

function isProductionRecoveryUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    url.hostname === PRODUCTION_SUPABASE_HOST &&
    url.pathname.endsWith('/auth/v1/recover')
  )
}

test.describe('Production password recovery delivery request', () => {
  test.skip(
    process.env.E2E_REAL_PASSWORD_RECOVERY !== '1',
    'Real password recovery is opt-in to avoid sending email from local/default suites.'
  )

  test('submits one real provider request and renders the enumeration-safe result', async ({
    page,
  }) => {
    const email = process.env.E2E_USER_EMAIL?.trim()
    if (!email) {
      throw new Error(
        'E2E_USER_EMAIL is required when E2E_REAL_PASSWORD_RECOVERY=1.'
      )
    }

    const baseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, '')
    if (baseUrl !== PRODUCTION_ALIAS) {
      throw new Error(
        'PLAYWRIGHT_BASE_URL must target the approved production alias for the real recovery proof.'
      )
    }

    let recoveryRequests = 0
    page.on('request', (request) => {
      if (isProductionRecoveryUrl(request.url())) {
        recoveryRequests += 1
      }
    })

    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email address').fill(email)

    const recoveryResponse = page.waitForResponse((response) =>
      isProductionRecoveryUrl(response.url())
    )
    await page.getByRole('button', { name: 'Send reset instructions' }).click()

    expect((await recoveryResponse).ok()).toBe(true)
    await expect(page.locator('.auth-success')).toHaveText(
      'If an account exists for that email, password reset instructions are on the way.'
    )
    expect(recoveryRequests).toBe(1)
  })
})
