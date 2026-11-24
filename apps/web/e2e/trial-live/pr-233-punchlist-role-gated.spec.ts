import { expect, test } from '../base-test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import { canViewPath } from '../../src/lib/operations/nav-config'
import { gateTrialLive, needsData, openRole, pickRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

const VIEW_ONLY = 'View only. Admin, SD / PM / PE, PM and CX can change the status of this item.'

test('punchlist status controls are role-gated', { tag: '@pr-233' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const row = z.object({ id: z.string().uuid() })
  const inProject = await tenantRows(target, 'punchlist_items', `project_id=eq.${target.projectId}&select=id&limit=1`, row)
  const [item] = inProject.length > 0
    ? inProject
    : await tenantRows(target, 'punchlist_items', 'select=id&order=created_at.desc&limit=1', row)
  if (!item) needsData('a punchlist item in the E2E tenant (Punchlist > new item on the E2E project)')

  const reader = pickRole('that sees the punchlist but cannot manage it', (r) => canViewPath(r, '/punchlist') && !roleHasCapability(r, 'punchlist.manage'))
  const readerSession = await openRole(browser, target, reader)
  try {
    const { page } = readerSession
    await page.goto('/punchlist')
    await expect(page.locator('a[href^="/punchlist/"]').first()).toBeVisible()
    await page.goto(`/punchlist/${item.id}`)
    await expect(page.getByText(VIEW_ONLY)).toBeVisible()
    // The "Status actions" heading renders for readers too; the gate is that no status control does.
    await expect(page.getByRole('heading', { name: 'Status actions' }).locator('xpath=..').getByRole('button')).toHaveCount(0)
  } finally {
    await readerSession.close()
  }

  const managerSession = await openRole(browser, target, 'admin')
  try {
    const { page } = managerSession
    await page.goto(`/punchlist/${item.id}`)
    await expect(page.getByText(/Status actions|This item is closed/).first()).toBeVisible()
    await expect(page.getByText(VIEW_ONLY)).toHaveCount(0)
  } finally {
    await managerSession.close()
  }
})
