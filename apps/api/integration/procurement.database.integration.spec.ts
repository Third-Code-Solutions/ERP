import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bomLineItems,
  boms,
  db,
  projects,
  rfqQuotes,
  rfqs,
  tenants,
  users,
  vendors,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ProcurementController } from '../src/procurement/procurement.controller'
import { RfqDispatchQueue } from '../src/procurement/rfq-dispatch.queue'
import { ProcurementService } from '../src/procurement/procurement.service'

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
      const bomAutoA = randomUUID()
      const bomDraftA = randomUUID()
      const lineA = randomUUID()
      const lineB = randomUUID()
      const lineCreateA = randomUUID()
      const lineAutoA = randomUUID()
      const lineDraftA = randomUUID()
      const vendorA = randomUUID()
      const vendorB = randomUUID()
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
