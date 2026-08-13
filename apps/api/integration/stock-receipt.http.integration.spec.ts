import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
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
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { StockReceiptController } from '../src/inventory/stock-receipt.controller'
import { StockReceiptCreatePipe } from '../src/inventory/stock-receipt-create.pipe'
import { StockReceiptCreationService } from '../src/inventory/stock-receipt-creation.service'
import { StockReceiptWorkflowService } from '../src/inventory/stock-receipt-workflow.service'

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
        ) => transaction.transaction(callback)
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

suite('Stock Receipt protected HTTP canary', () => {
  it('proves auth, RBAC, tenant, strict input, idempotency, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const adminB = randomUUID()
    const projectA = randomUUID()
    const uomA = randomUUID()
    const materialItemA = randomUUID()
    const purchaseOrderA = randomUUID()
    const poLineItemA = randomUUID()
    const warehouseA = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Stock Receipt HTTP Tenant A',
          slug: `stock-receipt-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Stock Receipt HTTP Tenant B',
          slug: `stock-receipt-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `stock-receipt-http-admin-a-${suffix}@integration.test`,
          full_name: 'Stock Receipt Admin A',
          role: 'procurement',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `stock-receipt-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Stock Receipt Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `stock-receipt-http-admin-b-${suffix}@integration.test`,
          full_name: 'Stock Receipt Admin B',
          role: 'procurement',
        },
      ])
      await transaction.insert(projects).values({
        id: projectA,
        tenant_id: tenantA,
        name: 'Stock Receipt HTTP Project A',
        client: 'Stock Receipt HTTP Client A',
        status: 'active',
        created_by: adminA,
      })
      await transaction.insert(unitsOfMeasure).values({
        id: uomA,
        tenant_id: tenantA,
        code: `PCS-${suffix}`,
        name: 'Pieces',
        decimal_places: 6,
        created_by: adminA,
      })
      await transaction.insert(materialItems).values({
        id: materialItemA,
        tenant_id: tenantA,
        code: `MAT-${suffix}`,
        description: 'Tracked receipt material',
        unit: 'pcs',
        base_uom_id: uomA,
        inventory_tracked: true,
        created_by: adminA,
      })
      await transaction.insert(purchaseOrders).values({
        id: purchaseOrderA,
        tenant_id: tenantA,
        project_id: projectA,
        created_by: adminA,
        po_number: `PO-${suffix}`,
        status: 'issued',
        subtotal_cents: 100_000,
        total_cents: 100_000,
      })
      await transaction.insert(poLineItems).values({
        id: poLineItemA,
        tenant_id: tenantA,
        po_id: purchaseOrderA,
        sort_order: 1,
        description: 'Tracked receipt material',
        unit: 'pcs',
        material_item_id: materialItemA,
        uom_id: uomA,
        quantity: 10,
        quantity_micros: 10_000_000,
        unit_cost_cents: 10_000,
        line_total_cents: 100_000,
      })
      await transaction.insert(warehouses).values({
        id: warehouseA,
        tenant_id: tenantA,
        code: `MAIN-${suffix}`,
        name: 'Stock Receipt HTTP Warehouse A',
        project_id: projectA,
        created_by: adminA,
      })

      const identities = new Map([
        ['stock-receipt-http-admin-a-token', adminA],
        ['stock-receipt-http-viewer-a-token', viewerA],
        ['stock-receipt-http-admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        enabled: true,
        tenantIds: [tenantA, tenantB],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [StockReceiptController],
        providers: [
          StockReceiptCreationService,
          StockReceiptCreatePipe,
          {
            provide: StockReceiptWorkflowService,
            useValue: {},
          },
          AuditService,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: DatabaseService,
            useValue: transactionBoundDatabase(transaction),
          },
          {
            provide: SupabaseIdentityService,
            useValue: identity,
          },
          {
            provide: APP_GUARD,
            useClass: SupabaseJwtGuard,
          },
          {
            provide: APP_GUARD,
            useClass: CapabilityGuard,
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()

      try {
        const command = {
          warehouseId: warehouseA,
          purchaseOrderId: purchaseOrderA,
          deliveryScheduleId: null,
          supplierDeliveryReference: 'DR-HTTP-001',
          receivedDate: '2026-08-10',
          notes: 'Protected HTTP receipt draft',
          lines: [{ poLineItemId: poLineItemA, quantity: '4.25' }],
        }

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer unknown-token')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-b-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const first = await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .set('Idempotency-Key', 'stock-receipt-http-1')
          .send(command)
          .expect(201)
        expect(first.body).toMatchObject({
          tenantId: tenantA,
          status: 'draft',
          lineCount: 1,
        })
        expect(first.body.stockReceiptId).toEqual(expect.any(String))

        const replay = await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .set('Idempotency-Key', 'stock-receipt-http-1')
          .send(command)
          .expect(201)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post('/v1/inventory/stock-receipts')
          .set('Authorization', 'Bearer stock-receipt-http-admin-a-token')
          .set('Idempotency-Key', 'stock-receipt-http-1')
          .send({ ...command, notes: 'Different receipt' })
          .expect(409)

        const [requestRow] = await transaction
          .select()
          .from(stockReceiptCreateRequests)
          .where(
            and(
              eq(stockReceiptCreateRequests.tenant_id, tenantA),
              eq(
                stockReceiptCreateRequests.idempotency_key,
                'stock-receipt-http-1'
              )
            )
          )
          .limit(1)
        expect(requestRow).toMatchObject({
          state: 'succeeded',
          stock_receipt_id: first.body.stockReceiptId,
        })

        const [receiptCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(stockReceipts)
          .where(
            and(
              eq(stockReceipts.tenant_id, tenantA),
              eq(stockReceipts.id, first.body.stockReceiptId)
            )
          )
        expect(receiptCount?.count).toBe(1)

        const [line] = await transaction
          .select({ quantityMicros: stockReceiptLines.quantity_micros })
          .from(stockReceiptLines)
          .where(
            and(
              eq(stockReceiptLines.tenant_id, tenantA),
              eq(stockReceiptLines.stock_receipt_id, first.body.stockReceiptId)
            )
          )
          .limit(1)
        expect(line?.quantityMicros).toBe(4_250_000)

        const auditRows = await transaction
          .select({ action: auditLog.action, diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'stock_receipt'),
              eq(auditLog.entity_id, first.body.stockReceiptId),
              eq(auditLog.action, 'create')
            )
          )
        expect(
          auditRows.some((entry) => {
            const diff = entry.diff as { line_count?: number }
            return diff.line_count === 1
          })
        ).toBe(true)

        const [tenantBReceiptCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(stockReceipts)
          .where(eq(stockReceipts.tenant_id, tenantB))
        expect(tenantBReceiptCount?.count).toBe(0)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(stockReceiptCreateRequests)
          .where(eq(stockReceiptCreateRequests.tenant_id, tenantB))
        expect(tenantBRequestCount?.count).toBe(0)

        const securityRows = await transaction.execute(sql`
          select
            c.relrowsecurity as "rowSecurity",
            has_table_privilege('authenticated', 'public.stock_receipt_create_requests', 'SELECT') as "authenticatedCanSelect",
            has_table_privilege('anon', 'public.stock_receipt_create_requests', 'SELECT') as "anonCanSelect"
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'stock_receipt_create_requests'
        `)
        expect((securityRows as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
          rowSecurity: true,
          authenticatedCanSelect: false,
          anonCanSelect: false,
        })
      } finally {
        await app.close()
      }
    })
  })
})
