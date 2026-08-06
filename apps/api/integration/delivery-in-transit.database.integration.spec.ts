import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  db,
  deliverySchedules,
  deliveryWorkflowRequests,
  projects,
  purchaseOrders,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import type { DatabaseTransaction } from '../src/database/database.service'
import type { DatabaseService } from '../src/database/database.service'
import { DeliveryWorkflowService } from '../src/procurement/delivery-workflow.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }
      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })
  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

suite('delivery in-transit workflow database integration', () => {
  it('commits the site-ready transition once, replays safely, and isolates tenants', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const otherTenantId = randomUUID()
      const actorId = randomUUID()
      const otherActorId = randomUUID()
      const projectId = randomUUID()
      const otherProjectId = randomUUID()
      const purchaseOrderId = randomUUID()
      const otherPurchaseOrderId = randomUUID()
      const deliveryId = randomUUID()
      const otherDeliveryId = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await transaction.insert(tenants).values([
        { id: tenantId, name: 'In transit A', slug: `in-transit-a-${suffix}` },
        {
          id: otherTenantId,
          name: 'In transit B',
          slug: `in-transit-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: actorId,
          tenant_id: tenantId,
          email: `in-transit-a-${suffix}@integration.test`,
          full_name: 'In Transit A',
          role: 'procurement',
        },
        {
          id: otherActorId,
          tenant_id: otherTenantId,
          email: `in-transit-b-${suffix}@integration.test`,
          full_name: 'In Transit B',
          role: 'procurement',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectId,
          tenant_id: tenantId,
          name: 'In transit project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: actorId,
        },
        {
          id: otherProjectId,
          tenant_id: otherTenantId,
          name: 'In transit project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: otherActorId,
        },
      ])
      await transaction.insert(purchaseOrders).values([
        {
          id: purchaseOrderId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: actorId,
          po_number: `PO-IN-TRANSIT-${suffix}`,
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        },
        {
          id: otherPurchaseOrderId,
          tenant_id: otherTenantId,
          project_id: otherProjectId,
          created_by: otherActorId,
          po_number: `PO-IN-TRANSIT-B-${suffix}`,
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        },
      ])
      await transaction.insert(deliverySchedules).values([
        {
          id: deliveryId,
          tenant_id: tenantId,
          purchase_order_id: purchaseOrderId,
          status: 'site_ready',
          site_address: 'Site A',
          created_by: actorId,
        },
        {
          id: otherDeliveryId,
          tenant_id: otherTenantId,
          purchase_order_id: otherPurchaseOrderId,
          status: 'site_ready',
          site_address: 'Site B',
          created_by: otherActorId,
        },
      ])

      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED') {
            return true
          }
          if (key === 'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS') {
            return [tenantId]
          }
          return fallback
        }),
      }
      const service = new DeliveryWorkflowService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const principal: ErpPrincipal = {
        userId: actorId,
        tenantId,
        role: 'procurement',
        email: `in-transit-a-${suffix}@integration.test`,
      }

      const first = await service.markInTransit(
        deliveryId,
        {},
        principal,
        'delivery-in-transit-integration-1'
      )
      const replay = await service.markInTransit(
        deliveryId,
        {},
        principal,
        'delivery-in-transit-integration-1'
      )

      expect(replay).toEqual(first)
      expect(first).toEqual({
        deliveryScheduleId: deliveryId,
        tenantId,
        action: 'mark_in_transit',
        fromStatus: 'site_ready',
        status: 'in_transit',
      })
      await expect(
        service.markInTransit(
          deliveryId,
          {},
          principal,
          'delivery-in-transit-integration-1-different'
        )
      ).rejects.toThrow('Cannot mark delivery in transit from delivery status')

      const [schedule] = await transaction
        .select({ status: deliverySchedules.status })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.tenant_id, tenantId),
            eq(deliverySchedules.id, deliveryId)
          )
        )
      expect(schedule?.status).toBe('in_transit')

      const requests = await transaction
        .select({
          action: deliveryWorkflowRequests.action,
          state: deliveryWorkflowRequests.state,
          result: deliveryWorkflowRequests.result,
        })
        .from(deliveryWorkflowRequests)
        .where(
          and(
            eq(deliveryWorkflowRequests.tenant_id, tenantId),
            eq(
              deliveryWorkflowRequests.idempotency_key,
              'delivery-in-transit-integration-1'
            )
          )
        )
      expect(requests).toEqual([
        { action: 'mark_in_transit', state: 'succeeded', result: first },
      ])

      const auditRows = await transaction
        .select({ action: auditLog.action, diff: auditLog.diff })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantId),
            eq(auditLog.entity_type, 'delivery_schedule'),
            eq(auditLog.entity_id, deliveryId)
          )
        )
      expect(
        auditRows.some(
          (row) =>
            row.action === 'status_change' &&
            (row.diff as { from?: string; to?: string }).from ===
              'site_ready' &&
            (row.diff as { from?: string; to?: string }).to === 'in_transit'
        )
      ).toBe(true)

      await expect(
        service.markInTransit(
          otherDeliveryId,
          {},
          principal,
          'delivery-in-transit-cross-tenant-1'
        )
      ).rejects.toThrow('Delivery not found')
    })
  })
})
