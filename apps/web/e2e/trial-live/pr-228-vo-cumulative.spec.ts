import { expect, test, type Page } from '@playwright/test'
import { z } from 'zod'
import {
  RUN_ID,
  gateTrialLive,
  openRole,
  pesoTextToCents,
  tenantRows,
  trialTarget,
  type TrialTarget,
} from '../helpers/trial-live'

gateTrialLive()

const voRow = z.object({
  id: z.string().uuid(),
  description: z.string(),
  status: z.string(),
  cost_impact_cents: z.coerce.number(),
  time_impact_days: z.coerce.number(),
})

async function expectedCumulative(target: TrialTarget) {
  const rows = await tenantRows(
    target,
    'variation_orders',
    `project_id=eq.${target.projectId}&select=id,description,status,cost_impact_cents,time_impact_days`,
    voRow
  )
  const counted = rows.filter((row) => row.status !== 'draft' && row.status !== 'rejected')
  return {
    rows,
    costCents: counted.reduce((sum, row) => sum + row.cost_impact_cents, 0),
    timeDays: counted.reduce((sum, row) => sum + row.time_impact_days, 0),
  }
}

/** Rejects a draft VO from its detail page: a terminal state that must stay out of the total. */
async function rejectVo(page: Page, listUrl: string, id: string) {
  await page.goto(`${listUrl}/${id}`)
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByPlaceholder('Reason for rejection…').fill(`trial-live ${RUN_ID} cleanup`)
  await page.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(page.getByText('VO rejected.')).toBeVisible()
}

async function shownCumulative(page: Page) {
  const footer = page.locator('tfoot tr').filter({ hasText: 'Cumulative' })
  await expect(footer).toContainText('excludes draft and rejected')
  const cost = await footer.locator('td').filter({ hasText: '₱' }).first().innerText()
  const time = await footer.locator('td').filter({ hasText: /^[+−-]?\d+\s*d$/ }).first().innerText()
  return { costCents: pesoTextToCents(cost), timeDays: Number(time.replace(/[^\d−-]/g, '').replace('−', '-')) }
}

test('VO cumulative impact excludes draft and rejected VOs', { tag: '@pr-228' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const description = `trial-live ${RUN_ID} VO cumulative check`
  const listUrl = `/projects/${target.projectId}/vos`
  const admin = await openRole(browser, target, 'admin')
  const { page } = admin
  try {
    await page.goto(listUrl)
    const form = page.locator('form:has(textarea[name="description"])')
    await form.locator('textarea[name="description"]').fill(description)
    await form.locator('input[name="change_type_pick"]').first().check({ force: true })
    await form.locator('input[name="cost_impact_php"]').fill('1234.56')
    await form.locator('input[name="time_impact_days"]').fill('3')
    await form.getByRole('button', { name: 'Create VO' }).click()
    await expect(page.getByText('VO created as draft.')).toBeVisible()

    const afterDraft = await expectedCumulative(target)
    const created = afterDraft.rows.find((row) => row.description === description)
    expect(created?.status).toBe('draft')
    await page.goto(listUrl)
    expect(await shownCumulative(page)).toEqual({ costCents: afterDraft.costCents, timeDays: afterDraft.timeDays })

    await rejectVo(page, listUrl, created!.id)
    const afterReject = await expectedCumulative(target)
    expect(afterReject.rows.find((row) => row.id === created!.id)?.status).toBe('rejected')
    await page.goto(listUrl)
    expect(await shownCumulative(page)).toEqual({ costCents: afterReject.costCents, timeDays: afterReject.timeDays })
  } finally {
    try {
      // A VO cannot be deleted: leave every probe VO of this run in its terminal Rejected state.
      const leftovers = (await expectedCumulative(target)).rows.filter(
        (row) => row.description === description && row.status === 'draft'
      )
      for (const row of leftovers) await rejectVo(page, listUrl, row.id)
    } finally {
      await admin.close()
    }
  }
})
