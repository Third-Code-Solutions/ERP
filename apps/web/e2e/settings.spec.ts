import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const replacementPassword = 'TestReplacement!2026'
const fakeCurrentPassword = 'FakeCurrent!2026'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

function authUserResponse(userId: string, email: string) {
  return {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('settings page loads with workspace and account cards', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1')).toContainText('Settings')
    await expect(page.getByText('Workspace')).toBeVisible()
    await expect(page.getByText('Account')).toBeVisible()
  })

  test('account card shows user email', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Email')).toBeVisible()
  })

  test('profile route exposes account data and password change controls', async ({ page }) => {
    await page.goto('/settings')
    const profileLink = page.getByRole('link', {
      name: 'Open profile and password settings',
    })
    await expect(profileLink).toHaveAttribute('href', '/settings/profile')
    await profileLink.click()

    await expect(page).toHaveURL(/\/settings\/profile$/)
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    await expect(page.getByText('Account profile')).toBeVisible()
    const form = page.getByRole('form', { name: 'Change password' })
    await expect(form.getByLabel('Current password')).toBeVisible()
    await expect(form.getByLabel('New password', { exact: true })).toBeVisible()
    await expect(form.getByLabel('Confirm new password')).toBeVisible()
    await expect(form.getByRole('button', { name: 'Change password' })).toBeVisible()
  })

  test('profile password change reauthenticates the same user before update and signs out', async ({ page }) => {
    await page.goto('/settings/profile')
    const userId = (await page
      .getByText('User ID', { exact: true })
      .locator('..')
      .locator('dd')
      .textContent())?.trim()
    const email = (await page
      .getByText('Email', { exact: true })
      .locator('..')
      .locator('dd')
      .textContent())?.trim()
    expect(userId).toBeTruthy()
    expect(email).toMatch(/@/)
    let reauthenticationMatched = false
    let updateMatched = false

    await page.route('**/auth/v1/token**', async (route) => {
      const body = route.request().postDataJSON() as {
        email?: string
        password?: string
      }
      reauthenticationMatched =
        body.email === email && body.password === fakeCurrentPassword
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: authUserResponse(userId!, email!),
        }),
      })
    })

    await page.route('**/auth/v1/user', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      const body = route.request().postDataJSON() as {
        current_password?: string
        password?: string
      }
      updateMatched =
        body.current_password === fakeCurrentPassword &&
        body.password === replacementPassword
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: authUserResponse(userId!, email!) }),
      })
    })

    await page.getByLabel('Current password').fill(fakeCurrentPassword)
    await page.getByLabel('New password', { exact: true }).fill(replacementPassword)
    await page.getByLabel('Confirm new password').fill(replacementPassword)
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page).toHaveURL(/\/auth\/login\?password_updated=1$/)
    expect(reauthenticationMatched).toBe(true)
    expect(updateMatched).toBe(true)
    await expect(page.locator('.auth-success')).toHaveText(
      'Password updated. Sign in with your new password.'
    )
  })

  test('live provider rejects a wrong current password and no update follows', async ({ page }) => {
    let updateRequests = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/auth/v1/user') && request.method() === 'PUT') {
        updateRequests += 1
      }
    })

    await page.goto('/settings/profile')
    await page.getByLabel('Current password').fill('DefinitelyWrong!2026')
    await page.getByLabel('New password', { exact: true }).fill(replacementPassword)
    await page.getByLabel('Confirm new password').fill(replacementPassword)
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page.locator('#profile-password-error')).toHaveText(
      'Current password could not be verified. Check it and try again.'
    )
    await expect(page).toHaveURL(/\/settings\/profile$/)
    expect(updateRequests).toBe(0)
  })

  test('roadmap notice is shown at bottom of settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/phase 3/i)).toBeVisible()
  })
})
