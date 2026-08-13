import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  assetMaintenanceCreateRequests,
  assetMaintenanceRecords,
  assets,
  auditLog,
  db,
  tenants,
  users,
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
import { AssetMaintenanceController } from '../src/assets/asset-maintenance.controller'
import { AssetMaintenanceService } from '../src/assets/asset-maintenance.service'

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

suite('Asset maintenance protected HTTP canary', () => {
  it('proves auth, capability, tenant, idempotency, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const adminB = randomUUID()
    const assetA = randomUUID()
    const assetB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Asset Maintenance HTTP Tenant A',
          slug: `asset-maintenance-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Asset Maintenance HTTP Tenant B',
          slug: `asset-maintenance-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `asset-maintenance-http-admin-a-${suffix}@integration.test`,
          full_name: 'Asset Maintenance Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `asset-maintenance-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Asset Maintenance Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `asset-maintenance-http-admin-b-${suffix}@integration.test`,
          full_name: 'Asset Maintenance Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(assets).values([
        {
          id: assetA,
          tenant_id: tenantA,
          asset_tag: `EQ-HTTP-A-${suffix}`,
          name: 'Tenant A mobile crane',
          kind: 'equipment',
          status: 'active',
          location: 'Site A',
          commissioned_on: '2026-01-01',
          created_by: adminA,
        },
        {
          id: assetB,
          tenant_id: tenantB,
          asset_tag: `EQ-HTTP-B-${suffix}`,
          name: 'Tenant B mobile crane',
          kind: 'equipment',
          status: 'active',
          location: 'Site B',
          commissioned_on: '2026-01-01',
          created_by: adminB,
        },
      ])

      const identities = new Map([
        ['asset-maintenance-http-admin-a-token', adminA],
        ['asset-maintenance-http-viewer-a-token', viewerA],
        ['asset-maintenance-http-admin-b-token', adminB],
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
          if (
            key === 'ERP_ASSET_MAINTENANCE_READS_ENABLED' ||
            key === 'ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED'
          ) {
            return featureState.enabled
          }
          if (
            key === 'ERP_ASSET_MAINTENANCE_READS_TENANT_IDS' ||
            key === 'ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS'
          ) {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [AssetMaintenanceController],
        providers: [
          AssetMaintenanceService,
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
        const route = (assetId: string) =>
          `/v1/assets/${assetId}/maintenance`
        const command = {
          maintenanceType: 'inspection',
          summary: 'Annual crane safety inspection',
          performedOn: '2026-01-15',
          nextDueOn: '2027-01-15',
          vendorName: 'Replay Service',
          costCents: 125_000,
          notes: 'All guards passed',
        }

        await request(app.getHttpServer())
          .post(route(assetA))
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer unknown-token')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-b-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .set('Idempotency-Key', 'asset-maintenance-http-1')
          .send(command)
          .expect(201)
        expect(first.body).toMatchObject({
          tenantId: tenantA,
          assetId: assetA,
          maintenanceType: 'inspection',
          summary: 'Annual crane safety inspection',
          costCents: 125_000,
        })
        expect(first.body.id).toEqual(expect.any(String))

        const replay = await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .set('Idempotency-Key', 'asset-maintenance-http-1')
          .send(command)
          .expect(201)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .set('Idempotency-Key', 'asset-maintenance-http-1')
          .send({ ...command, summary: 'Different inspection' })
          .expect(409)

        const history = await request(app.getHttpServer())
          .get(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .query({ page: 1, limit: 50 })
          .expect(200)
        expect(history.body).toMatchObject({
          tenantId: tenantA,
          assetId: assetA,
          total: 1,
          rows: [expect.objectContaining({ id: first.body.id })],
        })

        await request(app.getHttpServer())
          .get(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-b-token')
          .expect(404)

        featureState.enabled = false
        await request(app.getHttpServer())
          .get(route(assetA))
          .set('Authorization', 'Bearer asset-maintenance-http-admin-a-token')
          .expect(503)
        featureState.enabled = true

        const [requestRow] = await transaction
          .select()
          .from(assetMaintenanceCreateRequests)
          .where(
            and(
              eq(assetMaintenanceCreateRequests.tenant_id, tenantA),
              eq(
                assetMaintenanceCreateRequests.idempotency_key,
                'asset-maintenance-http-1'
              )
            )
          )
          .limit(1)
        expect(requestRow).toMatchObject({
          state: 'succeeded',
          maintenance_record_id: first.body.id,
        })

        const [recordCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(assetMaintenanceRecords)
          .where(
            and(
              eq(assetMaintenanceRecords.tenant_id, tenantA),
              eq(assetMaintenanceRecords.asset_id, assetA)
            )
          )
        expect(recordCount?.count).toBe(1)

        const [auditEntry] = await transaction
          .select({ action: auditLog.action, entityId: auditLog.entity_id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'asset_maintenance_record'),
              eq(auditLog.entity_id, first.body.id)
            )
          )
          .limit(1)
        expect(auditEntry).toMatchObject({
          action: 'create',
          entityId: first.body.id,
        })

        const [tenantBRecordCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(assetMaintenanceRecords)
          .where(eq(assetMaintenanceRecords.tenant_id, tenantB))
        expect(tenantBRecordCount?.count).toBe(0)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(assetMaintenanceCreateRequests)
          .where(eq(assetMaintenanceCreateRequests.tenant_id, tenantB))
        expect(tenantBRequestCount?.count).toBe(0)

        const securityRows = await transaction.execute(sql`
          select
            c.relrowsecurity as "rowSecurity",
            c.relforcerowsecurity as "forceRowSecurity",
            has_table_privilege('authenticated', 'public.asset_maintenance_records', 'SELECT') as "authenticatedCanSelect",
            has_table_privilege('anon', 'public.asset_maintenance_records', 'SELECT') as "anonCanSelect"
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'asset_maintenance_records'
        `)
        expect((securityRows as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
          rowSecurity: true,
          forceRowSecurity: true,
          authenticatedCanSelect: false,
          anonCanSelect: false,
        })
      } finally {
        await app.close()
      }
    })
  })
})
