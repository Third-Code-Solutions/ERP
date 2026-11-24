import { expect, test } from '../base-test'
import { z } from 'zod'
import { gateTrialLive, needsData, openRole, tapServerActions, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

const packageRow = z.object({ compiled_at: z.string().nullable(), as_built_document_id: z.string().uuid().nullable() })

test('turnover attaches only documents of its own project', { tag: '@pr-234' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const packageQuery = `project_id=eq.${target.projectId}&select=compiled_at,as_built_document_id&limit=1`
  const [before] = await tenantRows(target, 'turnover_packages', packageQuery, packageRow)
  if (before?.compiled_at) needsData('an uncompiled turnover package on the E2E project (it is compiled, so the pickers are hidden)')
  const [foreign] = await tenantRows(
    target,
    'documents',
    `project_id=neq.${target.projectId}&select=id&limit=1`,
    z.object({ id: z.string().uuid() })
  )
  if (!foreign) needsData('a document on another project of the E2E tenant')
  const attachedBefore = before?.as_built_document_id ?? null

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}/turnover`)
    const picker = page.getByLabel('Document for As-built drawings')
    if ((await picker.count()) === 0) needsData('documents on the E2E project for the turnover pickers')
    const own = attachedBefore ?? (await picker.locator('option:not([value=""])').first().getAttribute('value'))
    if (!own) needsData('documents on the E2E project for the turnover pickers')
    await picker.selectOption(own)

    // Send another project's document id through the real attach action.
    const tap = await tapServerActions(page, (body) => {
      let args: unknown
      try {
        args = JSON.parse(body)
      } catch {
        return null
      }
      if (!Array.isArray(args) || args[0] !== target.projectId || args[1] !== 'as_built' || args[2] !== own) return null
      return JSON.stringify([args[0], args[1], foreign.id])
    })
    try {
      await picker.locator('xpath=..').getByRole('button', { name: /^(Attach|Replace)$/ }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'That document was not found in this project.' })).toBeVisible()
    } finally {
      await tap.stop()
    }
    expect(tap.bodies).toHaveLength(1)
    const [after] = await tenantRows(target, 'turnover_packages', packageQuery, packageRow)
    expect(after?.as_built_document_id ?? null).toBe(attachedBefore)
  } finally {
    await admin.close()
  }
})
