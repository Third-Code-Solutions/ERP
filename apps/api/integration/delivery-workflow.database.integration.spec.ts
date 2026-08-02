import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import type { ConfigService } from '@nestjs/config'
import {
  auditLog,
  db,
  deliveryInspections,
  deliverySchedules,
  deliveryWorkflowRequests,
  projects,
  purchaseOrders,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
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

suite('Delivery receipt workflow database integration', () => {
  it('commits tenant-scoped receipt and inspection start exactly once', async () => {
    let probeTenantId = ''
    try {
      await db.transaction(async (transaction) => {
        const tenantId = randomUUID()
        const otherTenantId = randomUUID()
        const procurementId = randomUUID()
        const viewerId = randomUUID()
        const otherUserId = randomUUID()
        const projectId = randomUUID()
        const otherProjectId = randomUUID()
        const purchaseOrderId = randomUUID()
        const otherPurchaseOrderId = randomUUID()
        const deliveryId = randomUUID()
        const otherDeliveryId = randomUUID()
        const suffix = randomUUID().slice(0, 12)
        probeTenantId = tenantId

        await transaction.insert(tenants).values([
          {
            id: tenantId,
            name: 'Delivery receipt integration',
            slug: `delivery-receipt-${suffix}`,
          },
          {
            id: otherTenantId,
            name: 'Delivery receipt other tenant',
            slug: `delivery-receipt-other-${suffix}`,
          },
        ])
        await transaction.insert(users).values([
          {
            id: procurementId,
            tenant_id: tenantId,
            email: `procurement-${suffix}@integration.test`,
            full_name: 'Delivery Procurement',
            role: 'procurement',
          },
          {
            id: viewerId,
            tenant_id: tenantId,
            email: `viewer-${suffix}@integration.test`,
            full_name: 'Delivery Viewer',
            role: 'viewer',
          },
          {
            id: otherUserId,
            tenant_id: otherTenantId,
            email: `other-${suffix}@integration.test`,
            full_name: 'Other Tenant',
            role: 'procurement',
          },
        ])
        await transaction.insert(projects).values({
          id: projectId,
          tenant_id: tenantId,
          name: 'Receipt project',
          client: 'Receipt client',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: procurementId,
        })
        await transaction.insert(projects).values({
          id: otherProjectId,
          tenant_id: otherTenantId,
          name: 'Other receipt project',
          client: 'Other receipt client',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: otherUserId,
        })
        await transaction.insert(purchaseOrders).values({
          id: purchaseOrderId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: procurementId,
          po_number: 'PO-RECEIPT-0001',
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        })
        await transaction.insert(purchaseOrders).values({
          id: otherPurchaseOrderId,
          tenant_id: otherTenantId,
          project_id: otherProjectId,
          created_by: otherUserId,
          po_number: 'PO-RECEIPT-OTHER-0001',
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        })
        await transaction.insert(deliverySchedules).values([
          {
            id: deliveryId,
            tenant_id: tenantId,
            purchase_order_id: purchaseOrderId,
            status: 'in_transit',
            scheduled_date: new Date('2026-08-02T00:00:00.000Z'),
            site_address: 'Receipt site',
            site_contact_name: 'Site contact',
            site_contact_phone: '+63 900 000 0000',
            created_by: procurementId,
          },
          {
            id: otherDeliveryId,
            tenant_id: otherTenantId,
            purchase_order_id: otherPurchaseOrderId,
            status: 'in_transit',
            created_by: otherUserId,
          },
        ])

        const service = new DeliveryWorkflowService(
          {
            get: (key: string) => {
              if (key === 'ERP_DELIVERY_RECEIPT_WRITES_ENABLED') return true
              if (key === 'ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS') {
                return [tenantId]
              }
              if (key === 'ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED') {
                return true
              }
              if (key === 'ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS') {
                return [tenantId]
              }
              return undefined
            },
          } as unknown as ConfigService,
          transactionBoundDatabase(transaction),
          new AuditService()
        )
        const principal: ErpPrincipal = {
          userId: procurementId,
          tenantId,
          role: 'procurement',
          email: `procurement-${suffix}@integration.test`,
        }

        const first = await service.recordReceipt(
          deliveryId,
          { notes: 'DR-42' },
          principal,
          'delivery-receipt-integration-1'
        )
        const replay = await service.recordReceipt(
          deliveryId,
          { notes: 'DR-42' },
          principal,
          'delivery-receipt-integration-1'
        )
        expect(first).toEqual(replay)
        expect(first).toMatchObject({
          deliveryScheduleId: deliveryId,
          tenantId,
          fromStatus: 'in_transit',
          status: 'received',
        })

        await expect(
          service.recordReceipt(
            deliveryId,
            { notes: 'different command' },
            principal,
            'delivery-receipt-integration-1'
          )
        ).rejects.toThrow('Idempotency key was already used')

        const [schedule] = await transaction
          .select({
            status: deliverySchedules.status,
            receivedNotes: deliverySchedules.received_notes,
            receivedBy: deliverySchedules.received_by,
          })
          .from(deliverySchedules)
          .where(
            and(
              eq(deliverySchedules.tenant_id, tenantId),
              eq(deliverySchedules.id, deliveryId)
            )
          )
        const [request] = await transaction
          .select({
            state: deliveryWorkflowRequests.state,
            result: deliveryWorkflowRequests.result,
          })
          .from(deliveryWorkflowRequests)
          .where(
            and(
              eq(deliveryWorkflowRequests.tenant_id, tenantId),
              eq(
                deliveryWorkflowRequests.idempotency_key,
                'delivery-receipt-integration-1'
              )
            )
          )
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

        expect(schedule).toEqual({
          status: 'received',
          receivedNotes: 'DR-42',
          receivedBy: procurementId,
        })
        expect(request?.state).toBe('succeeded')
        expect(request?.result).toEqual(first)
        expect(
          auditRows.some(
            (row) =>
              row.action === 'status_change' &&
              (row.diff as { from?: string; to?: string }).from ===
                'in_transit' &&
              (row.diff as { from?: string; to?: string }).to === 'received'
          )
        ).toBe(true)

        const inspectionFirst = await service.startInspection(
          deliveryId,
          {},
          principal,
          'delivery-inspection-integration-1'
        )
        const inspectionReplay = await service.startInspection(
          deliveryId,
          {},
          principal,
          'delivery-inspection-integration-1'
        )
        expect(inspectionFirst).toEqual(inspectionReplay)
        expect(inspectionFirst).toMatchObject({
          deliveryScheduleId: deliveryId,
          tenantId,
          action: 'start_inspection',
          fromStatus: 'received',
          status: 'inspecting',
        })

        await expect(
          service.startInspection(
            deliveryId,
            {},
            principal,
            'delivery-receipt-integration-1'
          )
        ).rejects.toThrow('Idempotency key was already used')

        const [inspection] = await transaction
          .select({
            id: deliveryInspections.id,
            tenantId: deliveryInspections.tenant_id,
            scheduleId: deliveryInspections.delivery_schedule_id,
            inspectorId: deliveryInspections.inspector_id,
            result: deliveryInspections.result,
          })
          .from(deliveryInspections)
          .where(
            and(
              eq(deliveryInspections.tenant_id, tenantId),
              eq(
                deliveryInspections.id,
                inspectionFirst.inspectionId
              )
            )
          )
        expect(inspection).toEqual({
          id: inspectionFirst.inspectionId,
          tenantId,
          scheduleId: deliveryId,
          inspectorId: procurementId,
          result: 'pending',
        })

        const [inspectingSchedule] = await transaction
          .select({ status: deliverySchedules.status })
          .from(deliverySchedules)
          .where(
            and(
              eq(deliverySchedules.tenant_id, tenantId),
              eq(deliverySchedules.id, deliveryId)
            )
          )
        expect(inspectingSchedule?.status).toBe('inspecting')

        const [inspectionRequest] = await transaction
          .select({
            state: deliveryWorkflowRequests.state,
            result: deliveryWorkflowRequests.result,
            action: deliveryWorkflowRequests.action,
          })
          .from(deliveryWorkflowRequests)
          .where(
            and(
              eq(deliveryWorkflowRequests.tenant_id, tenantId),
              eq(
                deliveryWorkflowRequests.idempotency_key,
                'delivery-inspection-integration-1'
              )
            )
          )
        expect(inspectionRequest).toEqual({
          state: 'succeeded',
          result: inspectionFirst,
          action: 'start_inspection',
        })

        const inspectionAuditRows = await transaction
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
          inspectionAuditRows.some(
            (row) =>
              row.action === 'status_change' &&
              (row.diff as { from?: string; to?: string }).from ===
                'received' &&
              (row.diff as { from?: string; to?: string }).to ===
                'inspecting'
          )
        ).toBe(true)

        await expect(
          service.recordReceipt(
            otherDeliveryId,
            {},
            principal,
            'delivery-receipt-cross-tenant-1'
          )
        ).rejects.toThrow('Delivery not found')
        await expect(
          service.recordReceipt(
            deliveryId,
            {},
            {
              ...principal,
              userId: viewerId,
              role: 'viewer',
              email: `viewer-${suffix}@integration.test`,
            },
            'delivery-receipt-viewer-1'
          )
        ).rejects.toThrow()
        await expect(
          service.startInspection(
            otherDeliveryId,
            {},
            principal,
            'delivery-inspection-cross-tenant-1'
          )
        ).rejects.toThrow('Delivery not found')
        await expect(
          service.startInspection(
            deliveryId,
            {},
            {
              ...principal,
              userId: viewerId,
              role: 'viewer',
              email: `viewer-${suffix}@integration.test`,
            },
            'delivery-inspection-viewer-1'
          )
        ).rejects.toThrow()
        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) throw error
    }

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
