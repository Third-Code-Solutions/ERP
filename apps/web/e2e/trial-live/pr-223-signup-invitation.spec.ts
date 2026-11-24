import { expect, test } from '../base-test'
import { gateTrialLive } from '../helpers/trial-live'

gateTrialLive()

test('sign-up and login pages say sign-up is by invitation only', { tag: '@pr-223' }, async ({ page }) => {
  await page.goto('/auth/signup')
  await expect(page.getByRole('heading', { level: 1, name: 'Sign-up is by invitation' })).toBeVisible()
  await expect(page.getByText('Ask your administrator to invite you.').first()).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login')

  await page.goto('/auth/login')
  await expect(page.getByText('New here? Ask your administrator to invite you.')).toBeVisible()
  await expect(page.locator('a[href="/auth/signup"]')).toHaveCount(0)
})
