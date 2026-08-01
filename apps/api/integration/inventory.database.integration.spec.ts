import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  materialItems,
  poLineItems,
  projects,
  purchaseOrders,
  stockReceiptCreateRequests,
  stockReceiptLines,
  stockReceipts,
  tenants,
  unitsOfMeasure,
  users,
  warehouses,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { StockReceiptCreationService } from '../src/inventory/stock-receipt-creation.service'

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

suite('Stock Receipt API database integration', () => {
  it('creates a tenant-safe draft once and replays idempotently', async () => {
    let probeTenantId = ''
    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const userId = randomUUID()
      const projectId = randomUUID()
      const uomId = randomUUID()
      const materialItemId = randomUUID()
      const purchaseOrderId = randomUUID()
      const poLineItemId = randomUUID()
      const warehouseId = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantId

      await transaction.insert(tenants).values({
        id: tenantId,
        name: 'Inventory API Integration',
        slug: `inventory-api-${suffix}`,
      })
      await transaction.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `inventory-api-${suffix}@integration.test`,
        full_name: 'Inventory API User',
        role: 'procurement',
      })
      await transaction.insert(projects).values({
        id: projectId,
        tenant_id: tenantId,
        name: 'Inventory API Project',
        client: 'Inventory API Client',
        status: 'active',
        created_by: userId,
      })
      await transaction.insert(unitsOfMeasure).values({
        id: uomId,
        tenant_id: tenantId,
        code: `PCS-${suffix}`,
        name: 'Pieces',
        decimal_places: 6,
        created_by: userId,
      })
      await transaction.insert(materialItems).values({
        id: materialItemId,
        tenant_id: tenantId,
        code: `MAT-${suffix}`,
        description: 'Tracked integration material',
        unit: 'pcs',
        base_uom_id: uomId,
        inventory_tracked: true,
        created_by: userId,
      })
      await transaction.insert(purchaseOrders).values({
        id: purchaseOrderId,
        tenant_id: tenantId,
        project_id: projectId,
        created_by: userId,
        po_number: `PO-${suffix}`,
        status: 'issued',
        subtotal_cents: 100_000,
        total_cents: 100_000,
      })
      await transaction.insert(poLineItems).values({
        id: poLineItemId,
        tenant_id: tenantId,
        po_id: purchaseOrderId,
        sort_order: 1,
        description: 'Tracked integration material',
        unit: 'pcs',
        material_item_id: materialItemId,
        uom_id: uomId,
        quantity: 10,
        quantity_micros: 10_000_000,
        unit_cost_cents: 10_000,
        line_total_cents: 100_000,
      })
      await transaction.insert(warehouses).values({
        id: warehouseId,
        tenant_id: tenantId,
        code: `MAIN-${suffix}`,
        name: 'Integration Warehouse',
        project_id: projectId,
        created_by: userId,
      })

      const principal: ErpPrincipal = {
        userId,
        tenantId,
        role: 'procurement',
        email: `inventory-api-${suffix}@integration.test`,
      }
      const config = {
        get: vi.fn((key: string) =>
          key === 'ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED'
            ? true
            : [tenantId]
        ),
      }
      const service = new StockReceiptCreationService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = {
        warehouseId,
        purchaseOrderId,
        deliveryScheduleId: null,
        supplierDeliveryReference: 'DR-INTEGRATION',
        receivedDate: '2026-08-01',
        notes: 'Integration draft',
        lines: [{ poLineItemId, quantity: '4.25' }],
      } as const

      const created = await service.create(command, principal, 'receipt-1')
      await expect(
        service.create(command, principal, 'receipt-1')
      ).resolves.toEqual(created)
      await expect(
        service.create(
          { ...command, lines: [{ poLineItemId, quantity: '4.5' }] },
          principal,
          'receipt-1'
        )
      ).rejects.toMatchObject({ status: 409 })

      const receipts = await transaction
        .select()
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.tenant_id, tenantId),
            eq(stockReceipts.id, created.stockReceiptId)
          )
        )
      const lines = await transaction
        .select()
        .from(stockReceiptLines)
        .where(
          and(
            eq(stockReceiptLines.tenant_id, tenantId),
            eq(stockReceiptLines.stock_receipt_id, created.stockReceiptId)
          )
        )
      const requests = await transaction
        .select()
        .from(stockReceiptCreateRequests)
        .where(
          and(
            eq(stockReceiptCreateRequests.tenant_id, tenantId),
            eq(stockReceiptCreateRequests.idempotency_key, 'receipt-1')
          )
        )
      const semanticAudit = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantId),
            eq(auditLog.entity_id, created.stockReceiptId),
            eq(auditLog.action, 'create')
          )
        )

      expect(receipts).toHaveLength(1)
      expect(lines).toHaveLength(1)
      expect(lines[0]?.quantity_micros).toBe(4_250_000)
      expect(lines[0]?.line_total_cents).toBe(42_500)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.state).toBe('succeeded')
      expect(
        semanticAudit.filter((entry) => {
          const diff = entry.diff as { line_count?: number }
          return entry.action === 'create' && diff.line_count === 1
        })
      ).toHaveLength(1)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
