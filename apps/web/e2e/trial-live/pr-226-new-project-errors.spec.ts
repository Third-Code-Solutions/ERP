import { expect, test } from '../base-test'
import { z } from 'zod'
import { RUN_ID, gateTrialLive, openRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test('the new project form shows a readable validation error', { tag: '@pr-226' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    const name = `trial-live ${RUN_ID} invalid area`
    await page.goto('/projects/new')
    await page.locator('#name').fill(name)
    await page.locator('#client').fill(`trial-live ${RUN_ID}`)
    await page.locator('#total_sqm').fill('1.5')
    // Skip the browser's own number check so the server validation answers.
    await page.locator('form:has(#name)').evaluate((form) => form.setAttribute('novalidate', ''))
    await page.getByRole('button', { name: 'Create Project' }).click()

    await expect(page.locator('#new-project-error')).toHaveText(
      'Total area must be a whole number of at least 1.'
    )
    await expect(page).toHaveURL(/\/projects\/new/)
    const created = await tenantRows(target, 'projects', `name=eq.${encodeURIComponent(name)}&select=id`, z.object({ id: z.string() }))
    expect(created).toEqual([])
  } finally {
    await admin.close()
  }
})
