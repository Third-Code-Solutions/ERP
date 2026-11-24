import { expect, test } from '../base-test'
import { gateTrialLive, needsData, openRole, tapServerActions, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test(
  'a budget draft amount typed without trailing zeros is not reported as unsaved',
  { tag: '@pr-227' },
  async ({ browser }, testInfo) => {
    const target = await trialTarget(testInfo)
    const admin = await openRole(browser, target, 'admin')
    try {
      const { page } = admin
      await page.goto(`/projects/${target.projectId}/cost/budget`)
      if ((await page.getByRole('button', { name: 'Save draft' }).count()) === 0) {
        needsData('an editable budget draft on the E2E project (Budget tab > "Create draft")')
      }

      // The saved draft stores whole centavos ("1500.00"); typing "1500" is the
      // same amount and must not block submission as an unsaved edit.
      const amounts = page.getByLabel(/^Baseline amount \d+$/)
      let reformatted = false
      for (let index = 0; index < (await amounts.count()); index += 1) {
        const input = amounts.nth(index)
        const saved = (await input.inputValue()).trim()
        if (!/^\d+\.\d*0$/.test(saved)) continue
        await input.fill(saved.replace(/\.?0+$/, ''))
        reformatted = true
        break
      }
      if (!reformatted) needsData('a budget draft line whose saved amount ends in a zero decimal')

      // Abort the submit so the draft is never sent for approval.
      const tap = await tapServerActions(page)
      try {
        await page.getByRole('button', { name: 'Submit for approval' }).click()
        await expect.poll(() => tap.bodies.length, { message: 'submit reached the server action' }).toBeGreaterThan(0)
        await expect(
          page.getByText('Save the draft before submitting; the current editor has unsaved changes.')
        ).toHaveCount(0)
      } finally {
        await tap.stop()
      }
    } finally {
      await admin.close()
    }
  }
)
