import { randomUUID } from 'node:crypto'
import { expect, test } from '../base-test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import {
  ALL_ROLES,
  RUN_ID,
  callApi,
  gateTrialLive,
  noteNeedsData,
  openRole,
  tenantRows,
  trialTarget,
  type ApiResult,
} from '../helpers/trial-live'

gateTrialLive()

const FEATURE_DISABLED = 503
const statusRow = z.object({ status: z.string() })
const materialRow = z.object({ id: z.string().guid(), base_uom_id: z.string().guid() })
const requisitionPath = (id: string) => `/v1/roadmap/procurement/requisitions/${id}/workflow`

function created<T extends z.ZodTypeAny>(result: ApiResult, schema: T): z.infer<T> {
  expect(result.status, result.body).toBe(201)
  return schema.parse(JSON.parse(result.body))
}

test(
  'requisition decisions and price-list activation keep maker and checker apart',
  { tag: '@pr-249' },
  async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000)
    const target = await trialTarget(testInfo)

    await test.step('a role without po.approve cannot approve or reject a requisition', async () => {
      const makers = ALL_ROLES.filter(
        (role) => roleHasCapability(role, 'po.create') && !roleHasCapability(role, 'po.approve')
      )
      expect(makers.length).toBeGreaterThan(0)
      for (const role of makers) {
        const session = await openRole(browser, target, role)
        try {
          // The capability check precedes the lookup, so an unknown id is refused before any read.
          for (const command of [{ action: 'approve' }, { action: 'reject', reason: `trial-live ${RUN_ID}` }]) {
            const response = await callApi(target, session.accessToken, 'POST', requisitionPath(randomUUID()), command)
            expect.soft(response.status, `${role} ${command.action}: ${response.body}`).toBe(403)
            expect.soft(response.body).toContain('PO approval capability is required to approve or reject a requisition')
          }
        } finally {
          await session.close()
        }
      }
    })

    const admin = await openRole(browser, target, 'admin')
    try {
      await test.step('the requester cannot approve their own requisition', async () => {
        const create = await callApi(target, admin.accessToken, 'POST', '/v1/roadmap/procurement/requisitions', {
          projectId: target.projectId,
          purpose: `trial-live ${RUN_ID} self-approval probe`,
          currency: 'PHP',
          lines: [{ description: `trial-live ${RUN_ID} probe line`, quantityMicros: '1000000', estimatedUnitCostCents: '100' }],
        })
        if (create.status === FEATURE_DISABLED) {
          noteNeedsData(testInfo, 'the procurement_lifecycle roadmap feature enabled for the E2E tenant (self-approval check)')
          return
        }
        const { requisitionId } = created(create, z.object({ requisitionId: z.string().guid() }).passthrough())
        try {
          const submit = await callApi(target, admin.accessToken, 'POST', requisitionPath(requisitionId), { action: 'submit' })
          expect(submit.status, submit.body).toBe(200)
          const approve = await callApi(target, admin.accessToken, 'POST', requisitionPath(requisitionId), { action: 'approve' })
          expect(approve.status, approve.body).toBe(403)
          expect(approve.body).toContain('The requester cannot approve their own requisition')
          const [row] = await tenantRows(target, 'procurement_requisitions', `id=eq.${requisitionId}&select=status`, statusRow)
          expect(row?.status).toBe('pending_approval')
        } finally {
          // Cancel works from draft and pending_approval; a regression that approved it has already failed above.
          const cancel = await callApi(target, admin.accessToken, 'POST', requisitionPath(requisitionId), {
            action: 'cancel',
            reason: `trial-live ${RUN_ID} cleanup`,
          })
          expect.soft(cancel.status, `cleanup cancel: ${cancel.body}`).toBe(200)
        }
      })

      await test.step('the price-list preparer cannot activate it', async () => {
        const [material] = await tenantRows(
          target,
          'material_items',
          'is_active=eq.true&select=id,base_uom_id&order=code.asc&limit=1',
          materialRow
        )
        if (!material) {
          noteNeedsData(testInfo, 'an active material item in the E2E tenant (price-list preparer check)')
          return
        }
        const create = await callApi(target, admin.accessToken, 'POST', '/v1/roadmap/price-lists', {
          code: `TL-${RUN_ID}`,
          name: `trial-live ${RUN_ID} maker-checker probe`,
          currency: 'PHP',
          validFrom: new Date().toISOString().slice(0, 10),
          items: [
            { materialItemId: material.id, uomId: material.base_uom_id, minimumQuantityMicros: '1000000', unitPriceCents: '100' },
          ],
        })
        if (create.status === FEATURE_DISABLED) {
          noteNeedsData(testInfo, 'the price_lists roadmap feature enabled for the E2E tenant (preparer check)')
          return
        }
        const { priceListId } = created(create, z.object({ priceListId: z.string().guid() }).passthrough())
        const workflow = `/v1/roadmap/price-lists/${priceListId}/workflow`
        const activate = await callApi(target, admin.accessToken, 'POST', workflow, { action: 'activate' })
        try {
          expect(activate.status, activate.body).toBe(403)
          expect(activate.body).toContain('The price list preparer cannot activate it')
          const [row] = await tenantRows(target, 'price_lists', `id=eq.${priceListId}&select=status`, statusRow)
          expect(row?.status).toBe('draft')
        } finally {
          // Price lists cannot be deleted: the probe stays an inactive draft. A regression that activated it is retired.
          if (activate.status === 200) await callApi(target, admin.accessToken, 'POST', workflow, { action: 'retire' })
        }
      })
    } finally {
      await admin.close()
    }
  }
)
