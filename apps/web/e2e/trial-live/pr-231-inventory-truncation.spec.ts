import { expect, test } from '../base-test'
import { gateTrialLive, noteNeedsData, openRole, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test('the inventory list renders and flags truncation instead of failing', { tag: '@pr-231' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto('/inventory')
    await expect(page.getByText('Inventory control center').first()).toBeVisible()
    await expect(page.getByText('On-hand value').first()).toBeVisible()
    await expect(page.getByText(/exceeds the display limit/i)).toHaveCount(0)
    if ((await page.getByText(/Showing the first \d+ stock lines/).count()) === 0) {
      noteNeedsData(testInfo, 'more than 500 non-zero stock balances in the E2E tenant to show the truncation notice')
    }
  } finally {
    await admin.close()
  }
})
