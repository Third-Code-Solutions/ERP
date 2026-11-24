import { expect, test } from '../base-test'
import { z } from 'zod'
import { RUN_ID, gateTrialLive, needsData, openRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

const uomRow = z.object({ id: z.string().guid(), code: z.string() })

// The Cash and Supplier Bill duplicate messages of this PR are checked by pr-241 (also tagged @pr-244).
test('a duplicate UOM code shows the constraint message, not a generic failure', { tag: '@pr-244' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const [existing] = await tenantRows(target, 'units_of_measure', 'select=id,code&order=code.asc&limit=1', uomRow)
  if (!existing) needsData('a unit of measure in the E2E tenant to duplicate')
  const sameCode = `code=eq.${encodeURIComponent(existing.code)}&select=id,code`

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto('/inventory')
    const form = page.locator('form').filter({ has: page.locator('#uom-code') })
    // The unique index refuses the insert, so nothing is written.
    await form.locator('#uom-code').fill(existing.code)
    await form.locator('#uom-name').fill(`trial-live ${RUN_ID} duplicate probe`)
    await form.getByRole('button', { name: 'Add UOM' }).click()
    // Web path: "That UOM code already exists."; ERP Core path: "UOM code already exists".
    await expect(form.locator('.finance-form-error')).toHaveText(/UOM code already exists/)
    expect(await tenantRows(target, 'units_of_measure', sameCode, uomRow)).toHaveLength(1)
  } finally {
    await admin.close()
  }
})
