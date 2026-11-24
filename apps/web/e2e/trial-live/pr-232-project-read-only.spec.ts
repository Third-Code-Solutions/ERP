import { expect, test } from '@playwright/test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import { canViewPath } from '../../src/lib/operations/nav-config'
import { gateTrialLive, noteNeedsData, openRole, pickRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test('project tabs are read-only for roles that cannot act on them', { tag: '@pr-232' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const project = `/projects/${target.projectId}`

  await test.step('comments: no composer without project.update', async () => {
    const role = pickRole('that reads but cannot post comments', (r) => canViewPath(r, `${project}/comments`) && !roleHasCapability(r, 'project.update'))
    const session = await openRole(browser, target, role)
    try {
      await session.page.goto(`${project}/comments`)
      await expect(session.page.getByText('You can read comments on this project. Your role cannot post new ones.')).toBeVisible()
      await expect(session.page.locator('textarea')).toHaveCount(0)
    } finally {
      await session.close()
    }
  })

  await test.step('checklist: view-only notice without precon.manage_checklist', async () => {
    const role = pickRole('that reads but cannot manage the checklist', (r) => canViewPath(r, `${project}/checklist`) && !roleHasCapability(r, 'precon.manage_checklist'))
    const checklists = await tenantRows(target, 'pre_con_checklists', `project_id=eq.${target.projectId}&select=id&limit=1`, z.object({ id: z.string() }))
    const session = await openRole(browser, target, role)
    try {
      await session.page.goto(`${project}/checklist`)
      if (checklists.length === 0) {
        noteNeedsData(testInfo, 'a pre-construction checklist on the E2E project for the checklist view-only notice')
      } else {
        await expect(session.page.getByText('View only. Admin, Commercial, SD / PM / PE and PM can update checklist items.')).toBeVisible()
      }
      await expect(session.page.locator('input[type="checkbox"]:enabled')).toHaveCount(0)
    } finally {
      await session.close()
    }
  })

  await test.step('reports: generate button only with precon.manage_checklist', async () => {
    const reader = pickRole('that reads reports but cannot generate them', (r) => canViewPath(r, `${project}/reports`) && !roleHasCapability(r, 'precon.manage_checklist'))
    const generator = pickRole('that generates reports', (r) => canViewPath(r, `${project}/reports`) && roleHasCapability(r, 'precon.manage_checklist'))
    for (const [role, count] of [[generator, 1], [reader, 0]] as const) {
      const session = await openRole(browser, target, role)
      try {
        await session.page.goto(`${project}/reports`)
        await expect(session.page.getByRole('button', { name: 'Generate this week’s report' }), role).toHaveCount(count)
      } finally {
        await session.close()
      }
    }
  })

  await test.step('scope: no BOM link for roles that cannot open the BOM', async () => {
    const reader = pickRole('that reads scope but not the BOM', (r) => canViewPath(r, `${project}/scope`) && !canViewPath(r, `${project}/bom`))
    const session = await openRole(browser, target, reader)
    try {
      await session.page.goto(`${project}/scope`)
      await expect(session.page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(session.page.getByRole('link', { name: 'View BOM →' })).toHaveCount(0)
    } finally {
      await session.close()
    }
  })
})
