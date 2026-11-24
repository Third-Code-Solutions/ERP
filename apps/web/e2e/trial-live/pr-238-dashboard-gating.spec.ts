import { expect, test, type Page } from '../base-test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { STAGE_LEGACY_MAP, type OpportunityStage } from '@third-code-erp/shared-types/opportunities'
import { z } from 'zod'
import { gateTrialLive, noteNeedsData, openRole, pickRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

const FINANCIAL_ALERT = / overdue$|over BOM budget|eroding GP/
const MANAGEMENT_HEADING = 'Project margin & exposure'

function risk(page: Page) {
  return page.locator('section[aria-labelledby="risk-signals-heading"]')
}

/** "Cohort" of the first Stage Conversion row: opportunities at Lead or beyond. */
async function firstCohort(page: Page): Promise<number> {
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Stage Conversion' }) })
  return Number(await card.locator('tbody tr').first().locator('td').nth(2).innerText())
}

test(
  'dashboard financial alerts are role-gated and the closing-date filter narrows analytics',
  { tag: '@pr-238' },
  async ({ browser }, testInfo) => {
    const target = await trialTarget(testInfo)
    // Safety, CX and viewer land on My Work, which has no portfolio alerts.
    const restricted = pickRole(
      'on the executive dashboard without finance or budget access',
      (r) => !['safety', 'cx', 'viewer'].includes(r) && !roleHasCapability(r, 'finance.read') && !roleHasCapability(r, 'budget.read')
    )

    const limited = await openRole(browser, target, restricted)
    try {
      await limited.page.goto('/dashboard')
      await expect(risk(limited.page)).toBeVisible()
      await expect(risk(limited.page).getByText(FINANCIAL_ALERT)).toHaveCount(0)
      await expect(limited.page.getByRole('heading', { name: MANAGEMENT_HEADING })).toHaveCount(0)
    } finally {
      await limited.close()
    }

    const admin = await openRole(browser, target, 'admin')
    try {
      const { page } = admin
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: MANAGEMENT_HEADING })).toBeVisible()
      if ((await risk(page).getByText(FINANCIAL_ALERT).count()) === 0) {
        noteNeedsData(testInfo, 'an overdue invoice or cost overrun in the E2E tenant to show a financial alert that the restricted role must not see')
      }

      const opportunities = await tenantRows(
        target,
        'opportunities',
        'select=stage,closing_date',
        z.object({ stage: z.string(), closing_date: z.string().nullable() })
      )
      const open = opportunities.filter((row) => STAGE_LEGACY_MAP[row.stage as OpportunityStage] !== 'lost')
      // Manila day bounds, as the dashboard filter applies them.
      const closingBetween = (since: string, untilExclusive: string) =>
        open.filter((row) => {
          const closing = row.closing_date === null ? Number.NaN : Date.parse(row.closing_date)
          return closing >= Date.parse(`${since}T00:00:00+08:00`) && closing < Date.parse(`${untilExclusive}T00:00:00+08:00`)
        }).length

      expect(await firstCohort(page)).toBe(open.length)

      await page.goto('/dashboard?since=2000-01-01&until=2099-12-31')
      await expect(page.getByText('Closing from')).toBeVisible()
      await expect(page.getByLabel('Closing date — from')).toHaveValue('2000-01-01')
      await expect(page.getByLabel('Closing date — to')).toHaveValue('2099-12-31')
      expect(await firstCohort(page)).toBe(closingBetween('2000-01-01', '2100-01-01'))

      await page.goto('/dashboard?since=2099-06-01&until=2099-06-30')
      expect(await firstCohort(page)).toBe(closingBetween('2099-06-01', '2099-07-01'))
    } finally {
      await admin.close()
    }
  }
)
