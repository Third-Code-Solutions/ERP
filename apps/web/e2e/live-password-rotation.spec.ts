import { createHmac } from 'node:crypto'

import { expect, test, type Page, type Request } from '@playwright/test'

import { requireE2ECredentials } from './helpers/auth'

const LIVE_PASSWORD_ROTATION_ENABLED =
  process.env.E2E_LIVE_PASSWORD_ROTATION === '1'
const AUTH_OUTCOME_TIMEOUT_MS = 30_000
const RESTORATION_PROBE_TIMEOUT_MS = 10_000
const RESTORATION_ATTEMPTS = 2
const LOGIN_OUTCOME_POLL_MS = 100
// This budget protects routine in-worker cleanup. The external harness remains
// authoritative if Playwright interrupts the worker before finally completes.
const LIVE_PASSWORD_ROTATION_TIMEOUT_MS = 10 * 60_000
const PASSWORD_DERIVATION_LABELS = {
  temporary: 'abi-ops:e2e:password-rotation:temporary:v1',
  rejected: 'abi-ops:e2e:password-rotation:rejected-current:v1',
} as const

type FailureStage =
  | 'initial-original-login'
  | 'wrong-current-rejection'
  | 'rotate-to-temporary'
  | 'verify-original-rejected'
  | 'verify-temporary-login'
  | 'restore-original'
  | 'verify-original-restored'
  | 'final-local-sign-out'

type ProgressStage =
  | FailureStage
  | 'cleanup-started'
  | 'cleanup-probe-original'
  | 'cleanup-probe-temporary'
  | 'cleanup-restore-original'
  | 'cleanup-clear-local-session'
  | 'cleanup-complete'

test.use({
  actionTimeout: AUTH_OUTCOME_TIMEOUT_MS,
  navigationTimeout: AUTH_OUTCOME_TIMEOUT_MS,
  trace: 'off',
  video: 'off',
  screenshot: 'off',
})

function emitProgress(stage: ProgressStage): void {
  console.log(`[live-password-rotation] stage=${stage} status=started`)
}

function deriveStrongPassword(
  originalPassword: string,
  label: keyof typeof PASSWORD_DERIVATION_LABELS
): string {
  const digest = createHmac('sha256', originalPassword)
    .update(PASSWORD_DERIVATION_LABELS[label])
    .digest('base64url')
  return `Abi!9-${digest}`
}

async function clearLocalSession(page: Page): Promise<void> {
  // Supabase SSR stores this browser client's session in cookies. The API has
  // no timeout option; the external harness remains authoritative if it stalls.
  await page.context().clearCookies()
}

async function resetBrowserSession(
  page: Page,
  timeout = AUTH_OUTCOME_TIMEOUT_MS
): Promise<void> {
  await clearLocalSession(page)
  await page.goto('/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout,
  })
  await page.waitForLoadState('networkidle', { timeout })
  await page
    .getByRole('form', { name: 'Sign in' })
    .waitFor({ timeout })
}

async function waitForLoginOutcome(
  page: Page,
  timeout = AUTH_OUTCOME_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/dashboard') return true
    if (await page.locator('#login-error').isVisible().catch(() => false)) {
      return false
    }
    await page.waitForTimeout(LOGIN_OUTCOME_POLL_MS)
  }
  throw new Error('Timed out waiting for a credential-free login outcome.')
}

async function tryLogin(
  page: Page,
  email: string,
  password: string,
  timeout = AUTH_OUTCOME_TIMEOUT_MS
): Promise<boolean> {
  await resetBrowserSession(page, timeout)
  await page.getByLabel('Email').fill(email, { timeout })
  await page
    .getByLabel('Password', { exact: true })
    .fill(password, { timeout })
  await page
    .getByRole('button', { name: 'Sign in' })
    .click({ noWaitAfter: true, timeout })
  return waitForLoginOutcome(page, timeout)
}

async function probeLogin(
  page: Page,
  email: string,
  password: string
): Promise<boolean | null> {
  try {
    return await tryLogin(
      page,
      email,
      password,
      RESTORATION_PROBE_TIMEOUT_MS
    )
  } catch {
    return null
  }
}

async function submitProfilePasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await page.goto('/settings/profile', {
    waitUntil: 'domcontentloaded',
    timeout: AUTH_OUTCOME_TIMEOUT_MS,
  })
  await page.waitForLoadState('networkidle', {
    timeout: AUTH_OUTCOME_TIMEOUT_MS,
  })
  const form = page.getByRole('form', { name: 'Change password' })
  await form.waitFor({ timeout: AUTH_OUTCOME_TIMEOUT_MS })
  await form
    .getByLabel('Current password')
    .fill(currentPassword, { timeout: AUTH_OUTCOME_TIMEOUT_MS })
  await form
    .getByLabel('New password', { exact: true })
    .fill(newPassword, { timeout: AUTH_OUTCOME_TIMEOUT_MS })
  await form
    .getByLabel('Confirm new password')
    .fill(newPassword, { timeout: AUTH_OUTCOME_TIMEOUT_MS })
  await form
    .getByRole('button', { name: 'Change password' })
    .click({ noWaitAfter: true, timeout: AUTH_OUTCOME_TIMEOUT_MS })
}

async function changePasswordAndWaitForSignOut(
  page: Page,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await submitProfilePasswordChange(page, currentPassword, newPassword)
  const deadline = Date.now() + AUTH_OUTCOME_TIMEOUT_MS
  while (Date.now() < deadline) {
    const url = new URL(page.url())
    if (
      url.pathname === '/auth/login' &&
      url.searchParams.get('password_updated') === '1'
    ) {
      return
    }
    if (
      await page
        .locator('#profile-password-error')
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error('Password rotation returned a credential-free failure state.')
    }
    await page.waitForTimeout(LOGIN_OUTCOME_POLL_MS)
  }
  throw new Error(
    'Timed out waiting for the credential-free password rotation outcome.'
  )
}

async function restoreOriginalPassword(
  page: Page,
  email: string,
  originalPassword: string,
  temporaryPassword: string
): Promise<void> {
  for (let attempt = 0; attempt < RESTORATION_ATTEMPTS; attempt += 1) {
    emitProgress('cleanup-probe-original')
    const originalWorks = await probeLogin(page, email, originalPassword)
    if (originalWorks === true) {
      emitProgress('cleanup-clear-local-session')
      await resetBrowserSession(page, RESTORATION_PROBE_TIMEOUT_MS)
      emitProgress('cleanup-complete')
      return
    }

    emitProgress('cleanup-probe-temporary')
    const temporaryWorks = await probeLogin(page, email, temporaryPassword)
    if (temporaryWorks === true) {
      try {
        emitProgress('cleanup-restore-original')
        await changePasswordAndWaitForSignOut(
          page,
          temporaryPassword,
          originalPassword
        )
      } catch {
        // The provider may have completed the mutation before navigation failed.
        // The next iteration probes both known passwords before deciding.
      }
    }
  }

  emitProgress('cleanup-probe-original')
  const restored = await probeLogin(page, email, originalPassword)
  if (restored === true) {
    emitProgress('cleanup-clear-local-session')
    await resetBrowserSession(page, RESTORATION_PROBE_TIMEOUT_MS)
    emitProgress('cleanup-complete')
    return
  }

  throw new Error(
    'Live password rotation cleanup could not verify restoration of the original credential.'
  )
}

test.describe('Live password rotation', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: LIVE_PASSWORD_ROTATION_TIMEOUT_MS,
  })
  test.skip(
    !LIVE_PASSWORD_ROTATION_ENABLED,
    'Set E2E_LIVE_PASSWORD_ROTATION=1 only in the isolated live Auth lane.'
  )
  test.skip(
    process.platform === 'win32',
    'Live password rotation runs only in the non-Windows Chromium lane.'
  )

  test('rotates one account and restores the original password', async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== 'chromium', 'Live password rotation requires Chromium.')

    const { email, password: originalPassword } = requireE2ECredentials()
    if (process.env.E2E_LIVE_PASSWORD_ROTATION_CONFIRM_EMAIL !== email) {
      throw new Error(
        'Live password rotation target confirmation does not match the selected account.'
      )
    }
    const temporaryPassword = deriveStrongPassword(originalPassword, 'temporary')
    const rejectedCurrentPassword = deriveStrongPassword(
      originalPassword,
      'rejected'
    )
    let stage: FailureStage = 'initial-original-login'
    let failedStage: FailureStage | null = null
    const startStage = (nextStage: FailureStage) => {
      stage = nextStage
      emitProgress(nextStage)
    }

    try {
      emitProgress(stage)
      expect(await tryLogin(page, email, originalPassword)).toBe(true)

      let passwordUpdateRequests = 0
      const countPasswordUpdates = (request: Request) => {
        const url = new URL(request.url())
        if (
          request.method() === 'PUT' &&
          url.pathname.endsWith('/auth/v1/user')
        ) {
          passwordUpdateRequests += 1
        }
      }
      page.on('request', countPasswordUpdates)

      startStage('wrong-current-rejection')
      try {
        await submitProfilePasswordChange(
          page,
          rejectedCurrentPassword,
          temporaryPassword
        )
        await expect(page.locator('#profile-password-error')).toHaveText(
          'Current password could not be verified. Check it and try again.'
        )
        await expect(page).toHaveURL(/\/settings\/profile$/)
        expect(passwordUpdateRequests).toBe(0)
      } finally {
        page.off('request', countPasswordUpdates)
      }

      startStage('rotate-to-temporary')
      await changePasswordAndWaitForSignOut(
        page,
        originalPassword,
        temporaryPassword
      )
      await expect(page.locator('.auth-success')).toHaveText(
        'Password updated. Sign in with your new password.'
      )

      startStage('verify-original-rejected')
      expect(await tryLogin(page, email, originalPassword)).toBe(false)
      startStage('verify-temporary-login')
      expect(await tryLogin(page, email, temporaryPassword)).toBe(true)

      startStage('restore-original')
      await changePasswordAndWaitForSignOut(
        page,
        temporaryPassword,
        originalPassword
      )
      startStage('verify-original-restored')
      expect(await tryLogin(page, email, originalPassword)).toBe(true)
      startStage('final-local-sign-out')
      await resetBrowserSession(page)
    } catch {
      failedStage = stage
    } finally {
      try {
        emitProgress('cleanup-started')
        await restoreOriginalPassword(
          page,
          email,
          originalPassword,
          temporaryPassword
        )
      } catch {
        throw new Error(
          'EMERGENCY: Live password rotation cleanup could not verify the original credential after bounded restoration attempts.'
        )
      }
    }

    if (failedStage) {
      throw new Error(
        `Live password rotation failed at stage "${failedStage}"; cleanup verified the original credential.`
      )
    }
  })
})
