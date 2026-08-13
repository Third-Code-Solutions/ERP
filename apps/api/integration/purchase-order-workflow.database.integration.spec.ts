import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  db,
  notificationDeliveries,
  notificationOutbox,
  notifications,
  purchaseOrderSupplierEmailDeliveries,
  projects,
  purchaseOrderWorkflowRequests,
  purchaseOrders,
  tenants,
  users,
  vendors,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { AuditService } from '../src/audit/audit.service'
import type { DatabaseTransaction } from '../src/database/database.service'
import { PurchaseOrderWorkflowService } from '../src/procurement/purchase-order-workflow.service'
import { NotificationDeliveryService } from '../src/procurement/notification-delivery.service'
import type { NotificationEmailService } from '../src/procurement/notification-email.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import type { DatabaseService } from '../src/database/database.service'

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
          callback: (
            scopedTransaction: DatabaseTransaction
          ) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(
        transaction as unknown as object,
        property
      )
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })

  return { client } as DatabaseService
}

suite('Purchase Order workflow database integration', () => {
  it('commits tenant-scoped transitions atomically and replays idempotently', async () => {
    let probeTenantId = ''
    try {
      await db.transaction(async (transaction) => {
        const tenantId = randomUUID()
        const pmId = randomUUID()
        const commercialId = randomUUID()
        const procurementId = randomUUID()
        const adminId = randomUUID()
        const projectId = randomUUID()
        const vendorId = randomUUID()
        const purchaseOrderId = randomUUID()
        const suffix = randomUUID().slice(0, 12)
        probeTenantId = tenantId

        await transaction.insert(tenants).values({
          id: tenantId,
          name: 'PO workflow integration',
          slug: `po-workflow-${suffix}`,
        })
        await transaction.insert(users).values([
          {
            id: pmId,
            tenant_id: tenantId,
            email: `pm-${suffix}@integration.test`,
            full_name: 'Workflow PM',
            role: 'pm',
          },
          {
            id: commercialId,
            tenant_id: tenantId,
            email: `commercial-${suffix}@integration.test`,
            full_name: 'Workflow Commercial',
            role: 'commercial',
          },
          {
            id: procurementId,
            tenant_id: tenantId,
            email: `procurement-${suffix}@integration.test`,
            full_name: 'Workflow Procurement',
            role: 'procurement',
          },
          {
            id: adminId,
            tenant_id: tenantId,
            email: `admin-${suffix}@integration.test`,
            full_name: 'Workflow Admin',
            role: 'admin',
          },
        ])
        await transaction.insert(projects).values({
          id: projectId,
          tenant_id: tenantId,
          name: 'Workflow project',
          client: 'Workflow client',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: pmId,
        })
        await transaction.insert(vendors).values({
          id: vendorId,
          tenant_id: tenantId,
          name: 'Workflow Supplier',
          email: `supplier-${suffix}@integration.test`,
        })
        await transaction.insert(purchaseOrders).values({
          id: purchaseOrderId,
          tenant_id: tenantId,
          project_id: projectId,
          vendor_id: vendorId,
          created_by: pmId,
          po_number: 'PO-WORKFLOW-0001',
          status: 'draft',
          subtotal_cents: 100_000,
          vat_cents: 12_000,
          withholding_tax_cents: 2_000,
          total_cents: 110_000,
        })

        const config = {
          get: (key: string) => {
            if (
              key === 'ERP_PO_WORKFLOW_WRITES_ENABLED' ||
              key === 'ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED'
            ) {
              return true
            }
            return [tenantId]
          },
        } as unknown as ConfigService
        const service = new PurchaseOrderWorkflowService(
          config,
          transactionBoundDatabase(transaction),
          new AuditService()
        )
        const pmPrincipal: ErpPrincipal = {
          userId: pmId,
          tenantId,
          role: 'pm',
          email: `pm-${suffix}@integration.test`,
        }
        const commercialPrincipal: ErpPrincipal = {
          userId: commercialId,
          tenantId,
          role: 'commercial',
          email: `commercial-${suffix}@integration.test`,
        }
        const procurementPrincipal: ErpPrincipal = {
          userId: procurementId,
          tenantId,
          role: 'procurement',
          email: `procurement-${suffix}@integration.test`,
        }

        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'submit_pm_approval' },
            pmPrincipal,
            'workflow-submit-1'
          )
        ).resolves.toMatchObject({
          action: 'submit_pm_approval',
          fromStatus: 'draft',
          status: 'pending_pm_approval',
        })
        const pmApproval = await service.transition(
          purchaseOrderId,
          { action: 'pm_approve' },
          pmPrincipal,
          'workflow-approve-1'
        )
        expect(pmApproval).toMatchObject({
          fromStatus: 'pending_pm_approval',
          status: 'pending_commercial_approval',
        })
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'pm_approve' },
            pmPrincipal,
            'workflow-approve-1'
          )
        ).resolves.toEqual(pmApproval)
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'commercial_approve' },
            commercialPrincipal,
            'workflow-commercial-1'
          )
        ).resolves.toMatchObject({
          fromStatus: 'pending_commercial_approval',
          status: 'pending_scm_issuance',
        })
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'reject', reason: 'Too late' },
            commercialPrincipal,
            'workflow-reject-1'
          )
        ).resolves.toMatchObject({
          fromStatus: 'pending_scm_issuance',
          status: 'draft',
        })

        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'submit_pm_approval' },
            pmPrincipal,
            'workflow-submit-2'
          )
        ).resolves.toMatchObject({ status: 'pending_pm_approval' })
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'pm_approve' },
            pmPrincipal,
            'workflow-approve-2'
          )
        ).resolves.toMatchObject({ status: 'pending_commercial_approval' })
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'commercial_approve' },
            commercialPrincipal,
            'workflow-commercial-2'
          )
        ).resolves.toMatchObject({ status: 'pending_scm_issuance' })
        const scmIssue = await service.transition(
          purchaseOrderId,
          { action: 'scm_issue' },
          procurementPrincipal,
          'workflow-scm-1'
        )
        expect(scmIssue).toMatchObject({
          fromStatus: 'pending_scm_issuance',
          status: 'issued',
        })
        await expect(
          service.transition(
            purchaseOrderId,
            { action: 'scm_issue' },
            procurementPrincipal,
            'workflow-scm-1'
          )
        ).resolves.toEqual(scmIssue)

        const [po] = await transaction
          .select({ status: purchaseOrders.status })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.tenant_id, tenantId),
              eq(purchaseOrders.id, purchaseOrderId)
            )
          )
        const requests = await transaction
          .select()
          .from(purchaseOrderWorkflowRequests)
          .where(
            and(
              eq(purchaseOrderWorkflowRequests.tenant_id, tenantId),
              eq(
                purchaseOrderWorkflowRequests.purchase_order_id,
                purchaseOrderId
              )
            )
          )
        const auditRows = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantId),
              eq(auditLog.entity_id, purchaseOrderId)
            )
          )
        expect(po?.status).toBe('issued')
        expect(requests).toHaveLength(8)
        expect(requests.every((request) => request.state === 'succeeded')).toBe(
          true
        )
        expect(
          auditRows.filter((entry) => entry.action === 'status_change')
        ).toHaveLength(8)
        const workflowOutboxes = await transaction
          .select()
          .from(notificationOutbox)
          .where(eq(notificationOutbox.tenant_id, tenantId))
        expect(workflowOutboxes).toHaveLength(9)
        expect(
          workflowOutboxes.filter(
            (outbox) =>
              outbox.event_type === 'purchase_order.workflow_changed'
          ).every(
            (outbox) =>
              outbox.aggregate_id === purchaseOrderId
          )
        ).toBe(true)
        expect(
          workflowOutboxes.filter(
            (outbox) => outbox.event_type === 'purchase_order.supplier_issued'
          )
        ).toHaveLength(1)
        const workflowDeliveries = await transaction
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.tenant_id, tenantId))
        expect(workflowDeliveries.length).toBeGreaterThan(0)
        const sendPurchaseOrderWorkflow = vi
          .fn()
          .mockResolvedValue('po-workflow-provider-message')
        const sendPurchaseOrderSupplier = vi
          .fn()
          .mockResolvedValue('po-supplier-provider-message')
        const notificationDelivery = new NotificationDeliveryService(
          transactionBoundDatabase(transaction),
          {
            sendPurchaseOrderWorkflow,
            sendPurchaseOrderSupplier,
          } as unknown as NotificationEmailService,
          new AuditService()
        )
        for (const delivery of workflowDeliveries) {
          await expect(
            notificationDelivery.deliver({
              schemaVersion: 1,
              tenantId,
              outboxId: delivery.outbox_id,
              deliveryId: delivery.id,
            })
          ).resolves.toEqual({
            deliveryId: delivery.id,
            status: 'delivered',
          })
        }
        const deliveredInApp = await transaction
          .select()
          .from(notifications)
          .where(eq(notifications.tenant_id, tenantId))
        expect(deliveredInApp.length).toBeGreaterThan(0)
        expect(sendPurchaseOrderWorkflow).toHaveBeenCalled()
        const [supplierDelivery] = await transaction
          .select()
          .from(purchaseOrderSupplierEmailDeliveries)
          .where(eq(purchaseOrderSupplierEmailDeliveries.tenant_id, tenantId))
        expect(supplierDelivery).toBeDefined()
        const supplierOutbox = workflowOutboxes.find(
          (outbox) => outbox.event_type === 'purchase_order.supplier_issued'
        )
        expect(supplierOutbox).toBeDefined()
        await expect(
          notificationDelivery.deliverSupplierEmail({
            schemaVersion: 1,
            tenantId,
            outboxId: supplierOutbox!.id,
            deliveryId: supplierDelivery!.id,
          })
        ).resolves.toEqual({
          deliveryId: supplierDelivery!.id,
          status: 'delivered',
        })
        expect(sendPurchaseOrderSupplier).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientEmail: `supplier-${suffix}@integration.test`,
            totalCents: 110_000,
          })
        )
        const [stampedPo] = await transaction
          .select({ supplierEmailSentAt: purchaseOrders.supplier_email_sent_at })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, purchaseOrderId))
        expect(stampedPo?.supplierEmailSentAt).toBeInstanceOf(Date)
        const supplierAudit = await transaction
          .select()
          .from(auditLog)
          .where(eq(auditLog.tenant_id, tenantId))
        expect(
          supplierAudit.some(
            (entry) =>
              entry.action === 'update' &&
              entry.entity_type === 'purchase_order' &&
              entry.diff !== null &&
              (entry.diff as { supplier_email_delivered?: boolean })
                .supplier_email_delivered === true
          )
        ).toBe(true)
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
