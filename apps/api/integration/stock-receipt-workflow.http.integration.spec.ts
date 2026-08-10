import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  fiscalPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
  materialItems,
  poLineItems,
  projects,
  purchaseOrders,
  stockLedgerEntries,
  stockReceiptLines,
  stockReceipts,
  stockReceiptWorkflowRequests,
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
import { StockReceiptWorkflowService } from '../src/inventory/stock-receipt-workflow.service'
import {
  StockReceiptPostPipe,
  StockReceiptReversePipe,
} from '../src/inventory/stock-receipt-workflow.pipe'
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

suite('Stock Receipt post/reverse protected HTTP canary', () => {
  it(
    'proves official posting/reversal authority, tenant scope, idempotency, ledger, audit, and rollback',
    async () => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const financeA = randomUUID()
      const viewerA = randomUUID()
      const financeB = randomUUID()
      const projectA = randomUUID()
      const periodA = randomUUID()
      const inventoryAccountA = randomUUID()
      const grniAccountA = randomUUID()
      const uomA = randomUUID()
      const materialItemA = randomUUID()
      const purchaseOrderA = randomUUID()
      const poLineItemA = randomUUID()
      const warehouseA = randomUUID()
      const receiptA = randomUUID()
      const receiptLineA = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await alwaysRollback(async (transaction) => {
        await transaction.insert(tenants).values([
          {
            id: tenantA,
            name: 'Stock Receipt Workflow Tenant A',
            slug: `stock-receipt-workflow-a-${suffix}`,
          },
          {
            id: tenantB,
            name: 'Stock Receipt Workflow Tenant B',
            slug: `stock-receipt-workflow-b-${suffix}`,
          },
        ])
        await transaction.insert(users).values([
          {
            id: financeA,
            tenant_id: tenantA,
            email: `stock-receipt-workflow-finance-a-${suffix}@integration.test`,
            full_name: 'Stock Receipt Finance A',
            role: 'finance',
          },
          {
            id: viewerA,
            tenant_id: tenantA,
            email: `stock-receipt-workflow-viewer-a-${suffix}@integration.test`,
            full_name: 'Stock Receipt Viewer A',
            role: 'viewer',
          },
          {
            id: financeB,
            tenant_id: tenantB,
            email: `stock-receipt-workflow-finance-b-${suffix}@integration.test`,
            full_name: 'Stock Receipt Finance B',
            role: 'finance',
          },
        ])
        await transaction.insert(projects).values({
          id: projectA,
          tenant_id: tenantA,
          name: 'Stock Receipt Workflow Project A',
          client: 'Stock Receipt Workflow Client A',
          status: 'active',
          created_by: financeA,
        })
        await transaction.insert(fiscalPeriods).values({
          id: periodA,
          tenant_id: tenantA,
          name: `FY 2026 ${suffix}`,
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          status: 'open',
          created_by: financeA,
        })
        await transaction.insert(ledgerAccounts).values([
          {
            id: inventoryAccountA,
            tenant_id: tenantA,
            code: `1200-${suffix}`,
            name: 'Inventory',
            account_type: 'asset',
            normal_balance: 'debit',
            system_key: 'inventory',
            created_by: financeA,
          },
          {
            id: grniAccountA,
            tenant_id: tenantA,
            code: `2010-${suffix}`,
            name: 'Goods Received Not Invoiced',
            account_type: 'liability',
            normal_balance: 'credit',
            system_key: 'goods_received_not_invoiced',
            created_by: financeA,
          },
        ])
        await transaction.insert(unitsOfMeasure).values({
          id: uomA,
          tenant_id: tenantA,
          code: `PCS-${suffix}`,
          name: 'Pieces',
          decimal_places: 6,
          created_by: financeA,
        })
        await transaction.insert(materialItems).values({
          id: materialItemA,
          tenant_id: tenantA,
          code: `MAT-${suffix}`,
          description: 'Workflow receipt material',
          unit: 'pcs',
          base_uom_id: uomA,
          inventory_tracked: true,
          created_by: financeA,
        })
        await transaction.insert(purchaseOrders).values({
          id: purchaseOrderA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: financeA,
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
          description: 'Workflow receipt material',
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
          name: 'Stock Receipt Workflow Warehouse A',
          project_id: projectA,
          created_by: financeA,
        })
        await transaction.insert(stockReceipts).values({
          id: receiptA,
          tenant_id: tenantA,
          warehouse_id: warehouseA,
          purchase_order_id: purchaseOrderA,
          received_date: '2026-08-10',
          supplier_delivery_reference: 'DR-WORKFLOW-001',
          status: 'draft',
          notes: 'Protected workflow draft',
          created_by: financeA,
        })
        await transaction.insert(stockReceiptLines).values({
          id: receiptLineA,
          tenant_id: tenantA,
          stock_receipt_id: receiptA,
          po_line_item_id: poLineItemA,
          material_item_id: materialItemA,
          uom_id: uomA,
          line_number: 1,
          description: 'Workflow receipt material',
          quantity_micros: 4_250_000,
          unit_cost_cents: 10_000,
          line_total_cents: 42_500,
        })

        const identities = new Map([
          ['stock-receipt-workflow-finance-a-token', financeA],
          ['stock-receipt-workflow-viewer-a-token', viewerA],
          ['stock-receipt-workflow-finance-b-token', financeB],
        ])
        const identity = {
          verifyAccessToken: vi.fn(async (token: string) => {
            const userId = identities.get(token)
            return userId ? { userId } : null
          }),
        }
        const featureState = {
          postEnabled: true,
          reverseEnabled: true,
          tenantIds: [tenantA, tenantB],
        }
        const config = {
          get: vi.fn((key: string, fallback?: unknown) => {
            if (key === 'ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED') {
              return featureState.postEnabled
            }
            if (key === 'ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS') {
              return featureState.tenantIds
            }
            if (key === 'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED') {
              return featureState.reverseEnabled
            }
            if (key === 'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS') {
              return featureState.tenantIds
            }
            return fallback
          }),
        } as unknown as ConfigService

        const moduleRef = await Test.createTestingModule({
          controllers: [StockReceiptController],
          providers: [
            {
              provide: StockReceiptCreationService,
              useValue: {},
            },
            StockReceiptWorkflowService,
            StockReceiptCreatePipe,
            StockReceiptPostPipe,
            StockReceiptReversePipe,
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
          const postPath = `/v1/inventory/stock-receipts/${receiptA}/post`
          const reversePath = `/v1/inventory/stock-receipts/${receiptA}/reverse`
          const postCommand = { postingDate: '2026-08-10' }
          const reverseCommand = {
            postingDate: '2026-08-10',
            reason: 'Supplier correction',
          }
          const financeHeaders = {
            Authorization: 'Bearer stock-receipt-workflow-finance-a-token',
          }

          await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .send(postCommand)
            .expect(400)

          await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-strict-body')
            .send({ ...postCommand, tenantId: tenantA })
            .expect(400)

          await request(app.getHttpServer())
            .post(postPath)
            .set('Authorization', 'Bearer stock-receipt-workflow-viewer-a-token')
            .set('Idempotency-Key', 'workflow-viewer-denied')
            .send(postCommand)
            .expect(403)

          featureState.postEnabled = false
          await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-post-disabled')
            .send(postCommand)
            .expect(503)
          featureState.postEnabled = true

          await request(app.getHttpServer())
            .post(postPath)
            .set(
              'Authorization',
              'Bearer stock-receipt-workflow-finance-b-token'
            )
            .set('Idempotency-Key', 'workflow-cross-tenant')
            .send(postCommand)
            .expect(404)

          const firstPost = await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-post-1')
            .send(postCommand)
            .expect(200)
          expect(firstPost.body).toMatchObject({
            stockReceiptId: receiptA,
            tenantId: tenantA,
            status: 'posted',
          })
          expect(firstPost.body.receiptNumber).toMatch(/^SR-2026-\d{6}$/)
          expect(firstPost.body.journalEntryNumber).toMatch(/^JE-2026-\d{6}$/)

          const replayPost = await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-post-1')
            .send(postCommand)
            .expect(200)
          expect(replayPost.body).toEqual(firstPost.body)

          await request(app.getHttpServer())
            .post(postPath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-post-1')
            .send({ postingDate: '2026-08-11' })
            .expect(409)

          await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-post-1')
            .send(reverseCommand)
            .expect(409)

          const [postedReceipt] = await transaction
            .select({
              status: stockReceipts.status,
              internalNumber: stockReceipts.internal_number,
              postingJournalEntryId: stockReceipts.posting_journal_entry_id,
            })
            .from(stockReceipts)
            .where(
              and(
                eq(stockReceipts.tenant_id, tenantA),
                eq(stockReceipts.id, receiptA)
              )
            )
            .limit(1)
          expect(postedReceipt).toMatchObject({
            status: 'posted',
            internalNumber: firstPost.body.receiptNumber,
            postingJournalEntryId: firstPost.body.journalEntryId,
          })

          const postedJournal = await transaction
            .select({
              status: journalEntries.status,
              entryNumber: journalEntries.entry_number,
              sourceType: journalEntries.source_type,
            })
            .from(journalEntries)
            .where(
              and(
                eq(journalEntries.tenant_id, tenantA),
                eq(journalEntries.id, firstPost.body.journalEntryId)
              )
            )
            .limit(1)
          expect(postedJournal[0]).toMatchObject({
            status: 'posted',
            entryNumber: firstPost.body.journalEntryNumber,
            sourceType: 'system',
          })

          const [journalLineTotals] = await transaction
            .select({
              count: sql<number>`count(*)::int`,
              debit: sql<number>`coalesce(sum(${journalLines.debit_cents}), 0)::int`,
              credit: sql<number>`coalesce(sum(${journalLines.credit_cents}), 0)::int`,
            })
            .from(journalLines)
            .where(
              and(
                eq(journalLines.tenant_id, tenantA),
                eq(journalLines.journal_entry_id, firstPost.body.journalEntryId)
              )
            )
          expect(journalLineTotals).toEqual({
            count: 2,
            debit: 42_500,
            credit: 42_500,
          })

          const [postedLedgerCount] = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(stockLedgerEntries)
            .where(
              and(
                eq(stockLedgerEntries.tenant_id, tenantA),
                eq(stockLedgerEntries.stock_receipt_id, receiptA),
                eq(stockLedgerEntries.event_type, 'receipt')
              )
            )
          expect(postedLedgerCount?.count).toBe(1)

          const [receivedPoLine] = await transaction
            .select({ receivedMicros: poLineItems.received_quantity_micros })
            .from(poLineItems)
            .where(
              and(
                eq(poLineItems.tenant_id, tenantA),
                eq(poLineItems.id, poLineItemA)
              )
            )
          expect(receivedPoLine?.receivedMicros).toBe(4_250_000)

          const [postRequest] = await transaction
            .select({
              action: stockReceiptWorkflowRequests.action,
              state: stockReceiptWorkflowRequests.state,
              result: stockReceiptWorkflowRequests.result,
            })
            .from(stockReceiptWorkflowRequests)
            .where(
              and(
                eq(stockReceiptWorkflowRequests.tenant_id, tenantA),
                eq(
                  stockReceiptWorkflowRequests.idempotency_key,
                  'workflow-post-1'
                )
              )
            )
            .limit(1)
          expect(postRequest).toMatchObject({
            action: 'post',
            state: 'succeeded',
          })
          expect(postRequest?.result).toEqual(firstPost.body)

          featureState.reverseEnabled = false
          await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-reverse-disabled')
            .send(reverseCommand)
            .expect(503)
          featureState.reverseEnabled = true

          await request(app.getHttpServer())
            .post(reversePath)
            .set('Authorization', 'Bearer stock-receipt-workflow-viewer-a-token')
            .set('Idempotency-Key', 'workflow-reverse-viewer-denied')
            .send(reverseCommand)
            .expect(403)

          await request(app.getHttpServer())
            .post(reversePath)
            .set(
              'Authorization',
              'Bearer stock-receipt-workflow-finance-b-token'
            )
            .set('Idempotency-Key', 'workflow-reverse-cross-tenant')
            .send(reverseCommand)
            .expect(404)

          await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-reverse-invalid')
            .send({ postingDate: '2026-08-10', reason: 'x' })
            .expect(400)

          const firstReverse = await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-reverse-1')
            .send(reverseCommand)
            .expect(200)
          expect(firstReverse.body).toMatchObject({
            stockReceiptId: receiptA,
            tenantId: tenantA,
            status: 'reversed',
          })
          expect(firstReverse.body.reversalJournalEntryNumber).toMatch(
            /^JE-2026-\d{6}$/
          )

          const replayReverse = await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-reverse-1')
            .send(reverseCommand)
            .expect(200)
          expect(replayReverse.body).toEqual(firstReverse.body)

          await request(app.getHttpServer())
            .post(reversePath)
            .set(financeHeaders)
            .set('Idempotency-Key', 'workflow-reverse-1')
            .send({ ...reverseCommand, reason: 'Different correction' })
            .expect(409)

          const [reversedReceipt] = await transaction
            .select({
              status: stockReceipts.status,
              reversalJournalEntryId: stockReceipts.reversal_journal_entry_id,
              reversalReason: stockReceipts.reversal_reason,
            })
            .from(stockReceipts)
            .where(
              and(
                eq(stockReceipts.tenant_id, tenantA),
                eq(stockReceipts.id, receiptA)
              )
            )
            .limit(1)
          expect(reversedReceipt).toMatchObject({
            status: 'reversed',
            reversalJournalEntryId: firstReverse.body.reversalJournalEntryId,
            reversalReason: 'Supplier correction',
          })

          const [ledgerCount] = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(stockLedgerEntries)
            .where(
              and(
                eq(stockLedgerEntries.tenant_id, tenantA),
                eq(stockLedgerEntries.stock_receipt_id, receiptA)
              )
            )
          expect(ledgerCount?.count).toBe(2)

          const [reversedPoLine] = await transaction
            .select({ receivedMicros: poLineItems.received_quantity_micros })
            .from(poLineItems)
            .where(
              and(
                eq(poLineItems.tenant_id, tenantA),
                eq(poLineItems.id, poLineItemA)
              )
            )
          expect(reversedPoLine?.receivedMicros).toBe(0)

          const workflowRequests = await transaction
            .select({
              action: stockReceiptWorkflowRequests.action,
              state: stockReceiptWorkflowRequests.state,
            })
            .from(stockReceiptWorkflowRequests)
            .where(
              and(
                eq(stockReceiptWorkflowRequests.tenant_id, tenantA),
                eq(stockReceiptWorkflowRequests.stock_receipt_id, receiptA)
              )
            )
          expect(workflowRequests).toEqual(
            expect.arrayContaining([
              { action: 'post', state: 'succeeded' },
              { action: 'reverse', state: 'succeeded' },
            ])
          )

          const statusAudits = await transaction
            .select({ diff: auditLog.diff })
            .from(auditLog)
            .where(
              and(
                eq(auditLog.tenant_id, tenantA),
                eq(auditLog.entity_type, 'stock_receipt'),
                eq(auditLog.entity_id, receiptA),
                eq(auditLog.action, 'status_change')
              )
            )
          expect(
            statusAudits.some((entry) => {
              const diff = entry.diff as { from?: string; to?: string }
              return diff.from === 'draft' && diff.to === 'posted'
            })
          ).toBe(true)
          expect(
            statusAudits.some((entry) => {
              const diff = entry.diff as { from?: string; to?: string }
              return diff.from === 'posted' && diff.to === 'reversed'
            })
          ).toBe(true)

          const [tenantBRequestCount] = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(stockReceiptWorkflowRequests)
            .where(eq(stockReceiptWorkflowRequests.tenant_id, tenantB))
          expect(tenantBRequestCount?.count).toBe(0)

          const securityRows = await transaction.execute(sql`
            select
              c.relrowsecurity as "rowSecurity",
              c.relforcerowsecurity as "forceRowSecurity",
              has_table_privilege('authenticated', 'public.stock_receipt_workflow_requests', 'SELECT') as "authenticatedCanSelect",
              has_table_privilege('anon', 'public.stock_receipt_workflow_requests', 'SELECT') as "anonCanSelect"
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'stock_receipt_workflow_requests'
          `)
          expect(
            (securityRows as unknown as Array<Record<string, unknown>>)[0]
          ).toMatchObject({
            rowSecurity: true,
            forceRowSecurity: true,
            authenticatedCanSelect: false,
            anonCanSelect: false,
          })
        } finally {
          await app.close()
        }
      })
    },
    45_000
  )
})
