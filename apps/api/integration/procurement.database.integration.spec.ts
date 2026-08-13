import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bomLineItems,
  boms,
  db,
  materialItems,
  notificationDeliveries,
  notificationOutbox,
  notifications,
  poLineItems,
  purchaseOrderCreateRequests,
  purchaseOrders,
  rateCards,
  projects,
  rfqQuotes,
  rfqs,
  tenants,
  unitsOfMeasure,
  users,
  vendors,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ProcurementController } from '../src/procurement/procurement.controller'
import { NotificationDeliveryService } from '../src/procurement/notification-delivery.service'
import type { NotificationEmailService } from '../src/procurement/notification-email.service'
import { PurchaseOrderCreationService } from '../src/procurement/purchase-order-creation.service'
import { RfqDispatchQueue } from '../src/procurement/rfq-dispatch.queue'
import { ProcurementService } from '../src/procurement/procurement.service'
import type { ConfigService } from '@nestjs/config'

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

suite('Procurement API database integration', () => {
  it('enforces auth, tenant, idempotency, state, audit, and rollback boundaries', async () => {
    let probeTenantId = ''
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const procurementA = randomUUID()
      const commercialA = randomUUID()
      const procurementB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const bomA = randomUUID()
      const bomB = randomUUID()
      const bomCreateA = randomUUID()
      const bomGroupedA = randomUUID()
      const bomAutoA = randomUUID()
      const bomDraftA = randomUUID()
      const lineA = randomUUID()
      const lineB = randomUUID()
      const lineCreateA = randomUUID()
      const lineGroupedA = randomUUID()
      const lineAutoA = randomUUID()
      const lineDraftA = randomUUID()
      const vendorA = randomUUID()
      const vendorB = randomUUID()
      const unitA = randomUUID()
      const materialA = randomUUID()
      const rateCardA = randomUUID()
      const rfqA = randomUUID()
      const rfqB = randomUUID()
      const submissionId = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Procurement Integration A',
          slug: `procurement-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Procurement Integration B',
          slug: `procurement-integration-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: procurementA,
          tenant_id: tenantA,
          email: `procurement-a-${suffix}@integration.test`,
          full_name: 'Procurement A',
          role: 'procurement',
        },
        {
          id: commercialA,
          tenant_id: tenantA,
          email: `commercial-a-${suffix}@integration.test`,
          full_name: 'Commercial A',
          role: 'commercial',
        },
        {
          id: procurementB,
          tenant_id: tenantB,
          email: `procurement-b-${suffix}@integration.test`,
          full_name: 'Procurement B',
          role: 'procurement',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: procurementA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: procurementB,
        },
      ])
      await transaction.insert(boms).values([
        {
          id: bomA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: procurementA,
          status: 'approved',
        },
        {
          id: bomB,
          tenant_id: tenantB,
          project_id: projectB,
          created_by: procurementB,
          status: 'approved',
        },
        {
          id: bomCreateA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: procurementA,
          status: 'approved',
          total_cost_cents: 25_000,
        },
        {
          id: bomGroupedA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: procurementA,
          status: 'approved',
        },
        {
          id: bomAutoA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: procurementA,
          status: 'approved',
        },
        {
          id: bomDraftA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: procurementA,
          status: 'draft',
        },
      ])
      await transaction.insert(bomLineItems).values([
        {
          id: lineA,
          tenant_id: tenantA,
          bom_id: bomA,
          description: 'Line A',
          quantity: 1,
        },
        {
          id: lineB,
          tenant_id: tenantB,
          bom_id: bomB,
          description: 'Line B',
          quantity: 1,
        },
        {
          id: lineCreateA,
          tenant_id: tenantA,
          bom_id: bomCreateA,
          description: 'Creation line A',
          quantity: 2,
          unit: 'pcs',
          unit_cost_cents: 12_500,
          line_total_cents: 25_000,
        },
        {
          id: lineGroupedA,
          tenant_id: tenantA,
          bom_id: bomGroupedA,
          code: 'MAT-GROUP-A',
          description: 'Grouped line A',
          quantity: 2,
          unit: 'pcs',
          unit_cost_cents: 10_000,
          line_total_cents: 20_000,
        },
        {
          id: lineAutoA,
          tenant_id: tenantA,
          bom_id: bomAutoA,
          description: 'Automatic line A',
          quantity: 3,
          unit: 'pcs',
        },
        {
          id: lineDraftA,
          tenant_id: tenantA,
          bom_id: bomDraftA,
          description: 'Draft automatic line A',
          quantity: 1,
          unit: 'pcs',
        },
      ])
      await transaction.insert(vendors).values([
        {
          id: vendorA,
          tenant_id: tenantA,
          name: `Vendor A ${suffix}`,
        },
        {
          id: vendorB,
          tenant_id: tenantB,
          name: `Vendor B ${suffix}`,
        },
      ])
      await transaction.insert(unitsOfMeasure).values({
        id: unitA,
        tenant_id: tenantA,
        code: 'pcs',
        name: 'Pieces',
        created_by: procurementA,
      })
      await transaction.insert(materialItems).values({
        id: materialA,
        tenant_id: tenantA,
        code: 'MAT-GROUP-A',
        description: 'Grouped material A',
        unit: 'pcs',
        base_uom_id: unitA,
        created_by: procurementA,
      })
      await transaction.insert(rateCards).values({
        id: rateCardA,
        tenant_id: tenantA,
        material_item_id: materialA,
        vendor_id: vendorA,
        unit_price_cents: 10_000,
      })
      await transaction.insert(rfqs).values([
        {
          id: rfqA,
          tenant_id: tenantA,
          bom_id: bomA,
          status: 'pending',
          line_items: [
            {
              bom_line_item_id: lineA,
              material_item_id: null,
              description: 'Line A',
              qty: 1,
              unit: 'pcs',
            },
          ],
        },
        {
          id: rfqB,
          tenant_id: tenantB,
          bom_id: bomB,
          status: 'pending',
          line_items: [
            {
              bom_line_item_id: lineB,
              material_item_id: null,
              description: 'Line B',
              qty: 1,
              unit: 'pcs',
            },
          ],
        },
      ])

      const identities = new Map([
        ['procurement-a-token', procurementA],
        ['commercial-a-token', commercialA],
        ['procurement-b-token', procurementB],
      ])
      const identity = {
        verifyAccessToken: async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        },
      }
      const database = transactionBoundDatabase(transaction)
      const purchaseOrderCreation = new PurchaseOrderCreationService(
        {
          get: (key: string, fallback?: unknown) => {
            if (key === 'ERP_PO_BOM_CREATE_WRITES_ENABLED') return true
            if (key === 'ERP_PO_BOM_CREATE_WRITES_TENANT_IDS') return [tenantA]
            if (key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED') return true
            if (key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS') return [tenantA]
            return fallback
          },
        } as unknown as ConfigService,
        database,
        new AuditService()
      )
      const moduleRef = await Test.createTestingModule({
        controllers: [ProcurementController],
        providers: [
          Reflector,
          ProcurementService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: SupabaseIdentityService,
            useValue: identity,
          },
          {
            provide: DatabaseService,
            useValue: database,
          },
          {
            provide: RfqDispatchQueue,
            useValue: {
              enqueue: async () => ({
                jobId: 'integration-dispatch',
                enqueued: true,
              }),
            },
          },
          {
            provide: APP_GUARD,
            useExisting: SupabaseJwtGuard,
          },
          {
            provide: APP_GUARD,
            useExisting: CapabilityGuard,
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      await app.init()
      const procurementService =
        moduleRef.get(ProcurementService)

      const bomPurchaseOrderCommand = {
        bomId: bomCreateA,
        projectId: projectA,
        vendorId: vendorA,
        deliveryDate: null,
        notes: null,
      } as const
      const createdBomPurchaseOrder =
        await purchaseOrderCreation.createFromBom(
          bomPurchaseOrderCommand,
          {
            userId: procurementA,
            tenantId: tenantA,
            role: 'procurement',
            email: `procurement-a-${suffix}@integration.test`,
          },
          'bom-po-integration-1'
        )
      expect(createdBomPurchaseOrder).toMatchObject({
        tenantId: tenantA,
        bomId: bomCreateA,
        status: 'draft',
      })
      await expect(
        purchaseOrderCreation.createFromBom(
          bomPurchaseOrderCommand,
          {
            userId: procurementA,
            tenantId: tenantA,
            role: 'procurement',
            email: `procurement-a-${suffix}@integration.test`,
          },
          'bom-po-integration-1'
        )
      ).resolves.toEqual(createdBomPurchaseOrder)
      const [createdBomPurchaseOrderRow] = await transaction
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.tenant_id, tenantA),
            eq(purchaseOrders.id, createdBomPurchaseOrder.purchaseOrderId)
          )
        )
        .limit(1)
      const createdBomPurchaseOrderLines = await transaction
        .select()
        .from(poLineItems)
        .where(
          and(
            eq(poLineItems.tenant_id, tenantA),
            eq(poLineItems.po_id, createdBomPurchaseOrder.purchaseOrderId)
          )
        )
      const [lockedBom] = await transaction
        .select({ status: boms.status })
        .from(boms)
        .where(and(eq(boms.tenant_id, tenantA), eq(boms.id, bomCreateA)))
        .limit(1)
      const bomPurchaseOrderRequests = await transaction
        .select()
        .from(purchaseOrderCreateRequests)
        .where(
          and(
            eq(purchaseOrderCreateRequests.tenant_id, tenantA),
            eq(
              purchaseOrderCreateRequests.idempotency_key,
              'bom-po-integration-1'
            )
          )
        )
      expect(createdBomPurchaseOrderRow).toMatchObject({
        tenant_id: tenantA,
        project_id: projectA,
        vendor_id: vendorA,
        subtotal_cents: 25_000,
        vat_cents: 3_000,
        withholding_tax_cents: 500,
        total_cents: 27_500,
        status: 'draft',
      })
      expect(createdBomPurchaseOrderLines).toHaveLength(1)
      expect(createdBomPurchaseOrderLines[0]).toMatchObject({
        tenant_id: tenantA,
        bom_line_item_id: lineCreateA,
        quantity: 2,
        unit_cost_cents: 12_500,
        line_total_cents: 25_000,
      })
      expect(lockedBom?.status).toBe('locked')
      expect(bomPurchaseOrderRequests).toHaveLength(1)
      expect(bomPurchaseOrderRequests[0]?.state).toBe('succeeded')

      const groupedBomCommand = { bomId: bomGroupedA } as const
      const groupedResult = await purchaseOrderCreation.createGroupedFromBom(
        groupedBomCommand,
        {
          userId: procurementA,
          tenantId: tenantA,
          role: 'procurement',
          email: `procurement-a-${suffix}@integration.test`,
        },
        'grouped-bom-po-integration-1'
      )
      expect(groupedResult).toMatchObject({
        tenantId: tenantA,
        bomId: bomGroupedA,
        purchaseOrderIds: expect.arrayContaining([expect.any(String)]),
        groups: [
          {
            vendorId: vendorA,
            vendorName: `Vendor A ${suffix}`,
            lineCount: 1,
            subtotalCents: 20_000,
          },
        ],
      })
      await expect(
        purchaseOrderCreation.createGroupedFromBom(
          groupedBomCommand,
          {
            userId: procurementA,
            tenantId: tenantA,
            role: 'procurement',
            email: `procurement-a-${suffix}@integration.test`,
          },
          'grouped-bom-po-integration-1'
        )
      ).resolves.toEqual(groupedResult)
      const groupedPoId = groupedResult.purchaseOrderIds[0]
      const [groupedPo] = await transaction
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.tenant_id, tenantA),
            eq(purchaseOrders.id, groupedPoId)
          )
        )
        .limit(1)
      const groupedLines = await transaction
        .select()
        .from(poLineItems)
        .where(
          and(
            eq(poLineItems.tenant_id, tenantA),
            eq(poLineItems.po_id, groupedPoId)
          )
        )
      const [lockedGroupedBom] = await transaction
        .select({ status: boms.status })
        .from(boms)
        .where(
          and(eq(boms.tenant_id, tenantA), eq(boms.id, bomGroupedA))
        )
        .limit(1)
      const groupedRequests = await transaction
        .select()
        .from(purchaseOrderCreateRequests)
        .where(
          and(
            eq(purchaseOrderCreateRequests.tenant_id, tenantA),
            eq(
              purchaseOrderCreateRequests.idempotency_key,
              'grouped-bom-po-integration-1'
            )
          )
        )
      expect(groupedPo).toMatchObject({
        tenant_id: tenantA,
        project_id: projectA,
        vendor_id: vendorA,
        subtotal_cents: 20_000,
        vat_cents: 2_400,
        withholding_tax_cents: 400,
        total_cents: 22_000,
        status: 'draft',
      })
      expect(groupedLines).toHaveLength(1)
      expect(groupedLines[0]).toMatchObject({
        tenant_id: tenantA,
        bom_line_item_id: lineGroupedA,
        quantity: 2,
        unit_cost_cents: 10_000,
        line_total_cents: 20_000,
      })
      expect(lockedGroupedBom?.status).toBe('locked')
      expect(groupedRequests).toHaveLength(1)
      expect(groupedRequests[0]?.state).toBe('succeeded')

      const command = {
        submissionId,
        bomLineItemId: lineA,
        vendorId: vendorA,
        unitPriceCents: 125_050,
        leadTimeDays: 14,
        validUntil: '2026-08-31T00:00:00.000Z',
        notes: 'Integrated quote',
      }

      try {
        const automatic = await procurementService.createFromApprovedBom({
          schemaVersion: 1,
          tenantId: tenantA,
          actorId: procurementA,
          bomId: bomAutoA,
          source: 'bom_approved',
        })
        expect(automatic).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          lineCount: 1,
          created: true,
        })
        if (!automatic.notificationOutboxId) {
          throw new Error('Automatic RFQ outbox was not created')
        }
        await expect(
          procurementService.createFromApprovedBom({
            schemaVersion: 1,
            tenantId: tenantA,
            actorId: procurementA,
            bomId: bomAutoA,
            source: 'bom_approved',
          })
        ).resolves.toEqual({
          ...automatic,
          created: false,
        })
        await expect(
          procurementService.createFromApprovedBom({
            schemaVersion: 1,
            tenantId: tenantB,
            actorId: procurementA,
            bomId: bomAutoA,
            source: 'bom_approved',
          })
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          procurementService.createFromApprovedBom({
            schemaVersion: 1,
            tenantId: tenantA,
            actorId: commercialA,
            bomId: bomAutoA,
            source: 'bom_approved',
          })
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          procurementService.createFromApprovedBom({
            schemaVersion: 1,
            tenantId: tenantA,
            actorId: procurementA,
            bomId: bomDraftA,
            source: 'bom_approved',
          })
        ).rejects.toMatchObject({ status: 409 })

        const automaticDeliveries = await transaction
          .select()
          .from(notificationDeliveries)
          .where(
            and(
              eq(
                notificationDeliveries.tenant_id,
                tenantA
              ),
              eq(
                notificationDeliveries.outbox_id,
                automatic.notificationOutboxId
              )
            )
          )
        expect(automaticDeliveries).toHaveLength(2)
        expect(
          automaticDeliveries
            .map((delivery) => delivery.channel)
            .sort()
        ).toEqual(['email', 'in_app'])
        expect(
          automaticDeliveries.every(
            (delivery) =>
              delivery.recipient_user_id === procurementA &&
              delivery.recipient_email ===
                `procurement-a-${suffix}@integration.test`
          )
        ).toBe(true)

        const sendRfqCreated = vi
          .fn()
          .mockResolvedValue('provider-message-1')
        const notificationDelivery =
          new NotificationDeliveryService(database, {
            sendRfqCreated,
          } as unknown as NotificationEmailService)
        for (const delivery of automaticDeliveries) {
          const deliveryJob = {
            schemaVersion: 1 as const,
            tenantId: tenantA,
            outboxId: automatic.notificationOutboxId,
            deliveryId: delivery.id,
          }
          await expect(
            notificationDelivery.deliver(deliveryJob)
          ).resolves.toEqual({
            deliveryId: delivery.id,
            status: 'delivered',
          })
          await expect(
            notificationDelivery.deliver(deliveryJob)
          ).resolves.toEqual({
            deliveryId: delivery.id,
            status: 'already_delivered',
          })
        }
        expect(sendRfqCreated).toHaveBeenCalledTimes(1)

        const emailDelivery = automaticDeliveries.find(
          (delivery) => delivery.channel === 'email'
        )
        if (!emailDelivery) {
          throw new Error('Automatic RFQ email delivery is missing')
        }
        const emailJob = {
          schemaVersion: 1 as const,
          tenantId: tenantA,
          outboxId: automatic.notificationOutboxId,
          deliveryId: emailDelivery.id,
        }
        await transaction
          .update(notificationDeliveries)
          .set({
            status: 'processing',
            attempt_count: 1,
            provider_message_id: null,
            delivered_at: null,
            processing_started_at: new Date(),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(notificationDeliveries.tenant_id, tenantA),
              eq(notificationDeliveries.id, emailDelivery.id)
            )
          )
        await expect(
          notificationDelivery.deliver(emailJob)
        ).resolves.toEqual({
          deliveryId: emailDelivery.id,
          status: 'already_processing',
        })
        const staleAt = new Date(Date.now() - 10 * 60_000)
        await transaction
          .update(notificationDeliveries)
          .set({
            attempt_count: 5,
            processing_started_at: staleAt,
            updated_at: staleAt,
          })
          .where(
            and(
              eq(notificationDeliveries.tenant_id, tenantA),
              eq(notificationDeliveries.id, emailDelivery.id)
            )
          )
        await expect(
          notificationDelivery.deliver(emailJob)
        ).resolves.toEqual({
          deliveryId: emailDelivery.id,
          status: 'dead_letter',
        })
        expect(sendRfqCreated).toHaveBeenCalledTimes(1)

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs/dispatch')
          .send({ bomId: bomAutoA })
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs/dispatch')
          .set('Authorization', 'Bearer commercial-a-token')
          .send({ bomId: bomAutoA })
          .expect(403)

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs/dispatch')
          .set('Authorization', 'Bearer procurement-a-token')
          .send({
            bomId: bomAutoA,
            tenantId: tenantA,
          })
          .expect(400)

        const dispatch = await request(app.getHttpServer())
          .post('/v1/procurement/rfqs/dispatch')
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ bomId: bomAutoA })
          .expect(202)
        expect(dispatch.body).toEqual({
          jobId: 'integration-dispatch',
          enqueued: true,
        })

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs')
          .send({ bomId: bomCreateA })
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs')
          .set('Authorization', 'Bearer commercial-a-token')
          .send({ bomId: bomCreateA })
          .expect(403)

        await request(app.getHttpServer())
          .post('/v1/procurement/rfqs')
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ bomId: bomB })
          .expect(404)

        const createdRfq = await request(app.getHttpServer())
          .post('/v1/procurement/rfqs')
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ bomId: bomCreateA })
          .expect(200)
        expect(createdRfq.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          lineCount: 1,
          created: true,
        })

        const replayedRfq = await request(app.getHttpServer())
          .post('/v1/procurement/rfqs')
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ bomId: bomCreateA })
          .expect(200)
        expect(replayedRfq.body).toEqual({
          ...createdRfq.body,
          created: false,
        })

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .set('Authorization', 'Bearer commercial-a-token')
          .send(command)
          .expect(403)

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqB}/quotes`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ ...command, vendorId: vendorB })
          .expect(404)

        const created = await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send(command)
          .expect(201)
        expect(created.body).toMatchObject({
          created: true,
          statusChanged: true,
        })

        const replay = await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send(command)
          .expect(201)
        expect(replay.body).toEqual({
          quoteId: created.body.quoteId,
          created: false,
          statusChanged: false,
        })

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/quotes`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ ...command, unitPriceCents: 1 })
          .expect(409)

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqB}/transitions`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ command: 'complete' })
          .expect(404)

        const completed = await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/transitions`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ command: 'complete' })
          .expect(200)
        expect(completed.body).toEqual({
          rfqId: rfqA,
          tenantId: tenantA,
          transitioned: true,
        })

        await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqA}/transitions`)
          .set('Authorization', 'Bearer procurement-a-token')
          .send({ command: 'complete' })
          .expect(409)

        const cancelled = await request(app.getHttpServer())
          .post(`/v1/procurement/rfqs/${rfqB}/transitions`)
          .set('Authorization', 'Bearer procurement-b-token')
          .send({
            command: 'cancel',
            reason: 'Supplier withdrew',
          })
          .expect(200)
        expect(cancelled.body).toEqual({
          rfqId: rfqB,
          tenantId: tenantB,
          transitioned: true,
        })

        const quotes = await transaction
          .select()
          .from(rfqQuotes)
          .where(
            and(
              eq(rfqQuotes.tenant_id, tenantA),
              eq(rfqQuotes.submission_id, submissionId)
            )
          )
        const [updatedRfq] = await transaction
          .select({ status: rfqs.status })
          .from(rfqs)
          .where(
            and(
              eq(rfqs.tenant_id, tenantA),
              eq(rfqs.id, rfqA)
            )
          )
          .limit(1)
        const semanticAudit = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.actor_id, procurementA)
            )
          )
        const createdRfqRows = await transaction
          .select()
          .from(rfqs)
          .where(
            and(
              eq(rfqs.tenant_id, tenantA),
              eq(rfqs.bom_id, bomCreateA)
            )
          )
        const automaticRfqRows = await transaction
          .select()
          .from(rfqs)
          .where(
            and(
              eq(rfqs.tenant_id, tenantA),
              eq(rfqs.bom_id, bomAutoA)
            )
          )
        const automaticAudit = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, automatic.rfqId)
            )
          )
        const automaticOutboxRows = await transaction
          .select()
          .from(notificationOutbox)
          .where(
            and(
              eq(notificationOutbox.tenant_id, tenantA),
              eq(
                notificationOutbox.aggregate_id,
                automatic.rfqId
              )
            )
          )
        const deliveredNotificationRows = await transaction
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.tenant_id, tenantA),
              eq(
                notifications.recipient_user_id,
                procurementA
              )
            )
          )
        const tenantBCancelAudit = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantB),
              eq(auditLog.actor_id, procurementB),
              eq(auditLog.entity_id, rfqB)
            )
          )
        const [cancelledRfq] = await transaction
          .select({ status: rfqs.status })
          .from(rfqs)
          .where(
            and(
              eq(rfqs.tenant_id, tenantB),
              eq(rfqs.id, rfqB)
            )
          )
          .limit(1)

        expect(quotes).toHaveLength(1)
        expect(createdRfqRows).toHaveLength(1)
        expect(automaticRfqRows).toHaveLength(1)
        expect(automaticOutboxRows).toHaveLength(1)
        expect(automaticOutboxRows[0]?.id).toBe(
          automatic.notificationOutboxId
        )
        expect(deliveredNotificationRows).toHaveLength(1)
        expect(
          deliveredNotificationRows[0]?.source_delivery_id
        ).toBe(
          automaticDeliveries.find(
            (delivery) => delivery.channel === 'in_app'
          )?.id
        )
        expect(
          automaticAudit.filter((entry) => {
            const diff = entry.diff as {
              bom_id?: string
              line_count?: number
              source?: string
            }
            return (
              entry.action === 'create' &&
              diff.bom_id === bomAutoA &&
              diff.line_count === 1 &&
              diff.source === 'bom_approved'
            )
          })
        ).toHaveLength(1)
        expect(createdRfqRows[0]?.id).toBe(createdRfq.body.rfqId)
        expect(quotes[0]?.created_by).toBe(procurementA)
        expect(updatedRfq?.status).toBe('completed')
        expect(cancelledRfq?.status).toBe('cancelled')
        expect(
          semanticAudit.filter(
            (entry) =>
              entry.entity_type === 'rfq' &&
              entry.entity_id === createdRfq.body.rfqId &&
              entry.action === 'create' &&
              (
                entry.diff as {
                  bom_id?: string
                  line_count?: number
                  source?: string
                }
              ).bom_id === bomCreateA &&
              (
                entry.diff as {
                  bom_id?: string
                  line_count?: number
                  source?: string
                }
              ).line_count === 1 &&
              (
                entry.diff as {
                  bom_id?: string
                  line_count?: number
                  source?: string
                }
              ).source === 'manual'
          )
        ).toHaveLength(1)
        expect(
          semanticAudit.some(
            (entry) =>
              entry.entity_type === 'rfq_quote' &&
              entry.entity_id === created.body.quoteId &&
              entry.action === 'create'
          )
        ).toBe(true)
        expect(
          semanticAudit.some(
            (entry) =>
              entry.entity_type === 'rfq' &&
              entry.entity_id === rfqA &&
              entry.action === 'status_change' &&
              (
                entry.diff as {
                  from?: string
                  to?: string
                }
              ).from === 'quotes_received' &&
              (
                entry.diff as {
                  from?: string
                  to?: string
                }
              ).to === 'completed'
          )
        ).toBe(true)
        expect(
          tenantBCancelAudit.some(
            (entry) =>
              entry.entity_type === 'rfq' &&
              entry.entity_id === rfqB &&
              entry.action === 'status_change' &&
              (
                entry.diff as {
                  from?: string
                  to?: string
                  reason?: string
                }
              ).from === 'pending' &&
              (
                entry.diff as {
                  from?: string
                  to?: string
                  reason?: string
                }
              ).to === 'cancelled' &&
              (
                entry.diff as {
                  from?: string
                  to?: string
                  reason?: string
                }
              ).reason === 'Supplier withdrew'
          )
        ).toBe(true)
      } finally {
        await app.close()
      }
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
