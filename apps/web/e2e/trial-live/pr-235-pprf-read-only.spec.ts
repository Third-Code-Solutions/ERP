import { expect, test } from '../base-test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import { canViewPath } from '../../src/lib/operations/nav-config'
import { gateTrialLive, needsData, noteNeedsData, openRole, pickRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test('reviewers see the latest PPRF read-only', { tag: '@pr-235' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const reviewer = pickRole('that reads PPRFs but cannot submit one', (r) => canViewPath(r, '/crm/opportunities/x/proposal/pprf') && !roleHasCapability(r, 'pprf.submit'))
  const [submitted] = await tenantRows(
    target,
    'pprf_submissions',
    'submitted_at=not.is.null&select=opportunity_id&order=version.desc&limit=1',
    z.object({ opportunity_id: z.string().guid() })
  )
  const [anyOpportunity] = submitted
    ? [{ id: submitted.opportunity_id }]
    : await tenantRows(target, 'opportunities', 'select=id&limit=1', z.object({ id: z.string().guid() }))
  if (!anyOpportunity) needsData('an opportunity in the E2E tenant')

  const session = await openRole(browser, target, reviewer)
  try {
    const { page } = session
    await page.goto(`/crm/opportunities/${anyOpportunity.id}/proposal/pprf`)
    await expect(page.getByRole('heading', { name: 'Latest PPRF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit new PPRF version' })).toHaveCount(0)
    if (submitted) {
      await expect(page.getByRole('region', { name: /^PPRF version \d+$/ })).toBeVisible()
      await expect(page.getByText('Your role can read it but not submit a new version.')).toBeVisible()
    } else {
      await expect(page.getByText('No PPRF has been submitted yet. Your role cannot submit one.')).toBeVisible()
      noteNeedsData(testInfo, 'a submitted PPRF in the E2E tenant to show the read-only version')
    }
  } finally {
    await session.close()
  }
})
