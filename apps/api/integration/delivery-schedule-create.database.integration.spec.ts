import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import type { ConfigService } from '@nestjs/config'
import {
  auditLog,
  db,
  deliveryScheduleCreateRequests,
  deliverySchedules,
  notifications,
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

suite('delivery schedule creation database integration', () => {
  it('creates once, replays safely, isolates tenants, and audits notifications', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const otherTenantId = randomUUID()
      const actorId = randomUUID()
      const recipientId = randomUUID()
      const otherActorId = randomUUID()
      const projectId = randomUUID()
      const otherProjectId = randomUUID()
      const purchaseOrderId = randomUUID()
      const draftPurchaseOrderId = randomUUID()
      const otherPurchaseOrderId = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await transaction.insert(tenants).values([
        { id: tenantId, name: 'Schedule create A', slug: `schedule-create-a-${suffix}` },
        {
          id: otherTenantId,
          name: 'Schedule create B',
          slug: `schedule-create-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: actorId,
          tenant_id: tenantId,
          email: `schedule-create-a-${suffix}@integration.test`,
          full_name: 'Schedule Creator',
          role: 'procurement',
        },
        {
          id: recipientId,
          tenant_id: tenantId,
          email: `schedule-create-recipient-${suffix}@integration.test`,
          full_name: 'Project Lead',
          role: 'sd_pm_pe',
        },
        {
          id: otherActorId,
          tenant_id: otherTenantId,
          email: `schedule-create-b-${suffix}@integration.test`,
          full_name: 'Other Tenant',
          role: 'procurement',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectId,
          tenant_id: tenantId,
          name: 'Schedule create project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: actorId,
        },
        {
          id: otherProjectId,
          tenant_id: otherTenantId,
          name: 'Schedule create project B',
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
          po_number: `PO-SCHEDULE-${suffix}`,
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        },
        {
          id: draftPurchaseOrderId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: actorId,
          po_number: `PO-SCHEDULE-DRAFT-${suffix}`,
          status: 'draft',
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
          po_number: `PO-SCHEDULE-OTHER-${suffix}`,
          status: 'issued',
          subtotal_cents: 10_000,
          vat_cents: 1_200,
          withholding_tax_cents: 200,
          total_cents: 11_000,
        },
      ])

      const service = new DeliveryWorkflowService(
        {
          get: (key: string, fallback?: unknown) => {
            if (key === 'ERP_DELIVERY_SCHEDULE_CREATE_WRITES_ENABLED') {
              return true
            }
            if (key === 'ERP_DELIVERY_SCHEDULE_CREATE_WRITES_TENANT_IDS') {
              return [tenantId]
            }
            return fallback
          },
        } as unknown as ConfigService,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const principal: ErpPrincipal = {
        userId: actorId,
        tenantId,
        role: 'procurement',
        email: `schedule-create-a-${suffix}@integration.test`,
      }
      const command = {
        purchaseOrderId,
        scheduledDate: '2026-08-06T09:00:00.000Z',
        siteAddress: '6F, Third Code Building',
        siteContactName: 'Site lead',
        siteContactPhone: '+63 900 000 0000',
        sitePreparationNotes: null,
      } as const

      const first = await service.createSchedule(
        command,
        principal,
        'delivery-schedule-create-integration-1'
      )
      const replay = await service.createSchedule(
        command,
        principal,
        'delivery-schedule-create-integration-1'
      )
      expect(replay).toEqual(first)
      await expect(
        service.createSchedule(
          { ...command, siteAddress: 'Different site' },
          principal,
          'delivery-schedule-create-integration-1'
        )
      ).rejects.toThrow('Idempotency key was already used')

      await expect(
        service.createSchedule(
          { ...command, purchaseOrderId: draftPurchaseOrderId },
          principal,
          'delivery-schedule-create-draft'
        )
      ).rejects.toThrow('Purchase order must be issued')
      await expect(
        service.createSchedule(
          { ...command, purchaseOrderId: otherPurchaseOrderId },
          principal,
          'delivery-schedule-create-cross-tenant'
        )
      ).rejects.toThrow('Purchase order not found')

      const schedules = await transaction
        .select({ id: deliverySchedules.id, status: deliverySchedules.status })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.tenant_id, tenantId),
            eq(deliverySchedules.purchase_order_id, purchaseOrderId)
          )
        )
      expect(schedules).toEqual([{ id: first.id, status: 'scheduled' }])

      const [request] = await transaction
        .select({
          state: deliveryScheduleCreateRequests.state,
          deliveryScheduleId: deliveryScheduleCreateRequests.delivery_schedule_id,
          result: deliveryScheduleCreateRequests.result,
        })
        .from(deliveryScheduleCreateRequests)
        .where(
          and(
            eq(deliveryScheduleCreateRequests.tenant_id, tenantId),
            eq(
              deliveryScheduleCreateRequests.idempotency_key,
              'delivery-schedule-create-integration-1'
            )
          )
        )
      expect(request).toEqual({
        state: 'succeeded',
        deliveryScheduleId: first.id,
        result: first,
      })

      const recipientNotifications = await transaction
        .select({ recipientUserId: notifications.recipient_user_id })
        .from(notifications)
        .where(
          and(
            eq(notifications.tenant_id, tenantId),
            eq(notifications.link_url, `/procurement/deliveries/${first.id}`)
          )
        )
      expect(recipientNotifications).toHaveLength(2)

      const auditRows = await transaction
        .select({ action: auditLog.action, diff: auditLog.diff })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantId),
            eq(auditLog.entity_type, 'delivery_schedule'),
            eq(auditLog.entity_id, first.id)
          )
        )
      expect(
        auditRows.some(
          (row) =>
            row.action === 'create' &&
            (row.diff as { status?: string }).status === 'scheduled'
        )
      ).toBe(true)
    })
  })
})
