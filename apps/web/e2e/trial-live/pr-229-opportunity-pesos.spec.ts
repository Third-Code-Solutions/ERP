import { expect, test } from '../base-test'
import { RUN_ID, gateTrialLive, openRole, tapServerActions, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test('opportunity TCV and GP are entered in pesos and sent as centavos', { tag: '@pr-229' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}`)
    const add = page.getByRole('button', { name: '+ Add Opportunity' })
    // Shown to every role with opportunity.create, whatever the project holds: absent is a failure, not missing data.
    await expect(add).toBeVisible()
    await add.click()

    const form = page.getByRole('form', { name: 'Create opportunity' })
    await expect(form.getByLabel('TCV (₱)')).toBeVisible()
    await expect(form.getByLabel('GP (₱)')).toBeVisible()
    const tcv = form.locator('#new-opportunity-tcv')
    await tcv.fill('1.234')
    expect(await tcv.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true)

    await form.locator('#new-opportunity-type').fill(`trial-live ${RUN_ID}`)
    await tcv.fill('12345.67')
    await form.locator('#new-opportunity-gp').fill('2345.6')

    // Abort the create so no opportunity is written; inspect what would be sent.
    const tap = await tapServerActions(page)
    try {
      await form.getByRole('button', { name: 'Create Opportunity' }).click()
      await expect.poll(() => tap.bodies.length, { message: 'create reached the server action' }).toBeGreaterThan(0)
      const body = tap.bodies[0]!
      expect(body).toMatch(/name="(?:\d+_)?tcv_cents"\r\n\r\n1234567\r\n/)
      expect(body).toMatch(/name="(?:\d+_)?gp_cents"\r\n\r\n234560\r\n/)
    } finally {
      await tap.stop()
    }
  } finally {
    await admin.close()
  }
})
