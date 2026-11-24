import { expect, test } from '@playwright/test'
import { gateTrialLive, needsData, openRole, tapServerActions, trialTarget } from '../helpers/trial-live'

gateTrialLive()

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** advanceOpportunityStage(opportunityId, stage, reason, attemptId): the attempt id is the last UUID. */
function attemptIdOf(body: string): string {
  const ids = body.match(UUID) ?? []
  if (ids.length < 2) throw new Error(`Stage move carried no attempt id: ${body}`)
  return ids[ids.length - 1]!.toLowerCase()
}

test(
  'pipeline stage moves get a fresh attempt per gesture and Won has no quick-add',
  { tag: '@pr-230' },
  async ({ browser }, testInfo) => {
    const target = await trialTarget(testInfo)
    const admin = await openRole(browser, target, 'admin')
    try {
      const { page } = admin
      await page.goto('/pipeline')
      await expect(page.getByRole('button', { name: 'Add opportunity to Lead', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add opportunity to Won', exact: true })).toHaveCount(0)

      const move = page.getByRole('button', { name: /^Move opportunity to (?!Won$|Lost$)/ }).first()
      if ((await move.count()) === 0) {
        needsData('an open opportunity on the pipeline board with a single forward move short of Won')
      }

      // Both moves are aborted before reaching the server, so no card changes stage.
      const tap = await tapServerActions(page)
      try {
        await move.click()
        await expect.poll(() => tap.bodies.length, { message: 'first move reached the server action' }).toBeGreaterThan(0)
        await expect(move).toBeEnabled()
        const firstGesture = tap.bodies.length
        await move.click()
        await expect.poll(() => tap.bodies.length, { message: 'second move reached the server action' }).toBeGreaterThan(firstGesture)

        const first = new Set(tap.bodies.slice(0, firstGesture).map(attemptIdOf))
        const second = new Set(tap.bodies.slice(firstGesture).map(attemptIdOf))
        expect(first.size, 'retries of one gesture share its attempt id').toBe(1)
        expect([...second].some((id) => first.has(id)), 'a new gesture gets a new attempt id').toBe(false)
      } finally {
        await tap.stop()
      }
    } finally {
      await admin.close()
    }
  }
)
