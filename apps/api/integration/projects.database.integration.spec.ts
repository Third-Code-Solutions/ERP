import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, desc, eq } from 'drizzle-orm'
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
import { ProjectsController } from '../src/projects/projects.controller'
import { ProjectsService } from '../src/projects/projects.service'

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

suite('Projects API database integration', () => {
  it('enforces identity, capability, tenant, concurrency, audit, and rollback boundaries', async () => {
    let probeTenantId = ''
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const adminA = randomUUID()
      const viewerA = randomUUID()
      const adminB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      const observedAt = new Date('2026-07-27T01:00:00.000Z')
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'API Integration A',
          slug: `api-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'API Integration B',
          slug: `api-integration-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `admin-a-${suffix}@integration.test`,
          full_name: 'Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `viewer-a-${suffix}@integration.test`,
          full_name: 'Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `admin-b-${suffix}@integration.test`,
          full_name: 'Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Original A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          total_sqm: 100,
          created_by: adminA,
          updated_at: observedAt,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Original B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          total_sqm: 200,
          created_by: adminB,
          updated_at: observedAt,
        },
      ])

      const identities = new Map([
        ['admin-a-token', adminA],
        ['viewer-a-token', viewerA],
        ['admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        },
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          Reflector,
          ProjectsService,
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

      const command = {
        name: 'Updated A',
        client: 'Client A',
        status: 'active',
        projectType: 'fit_out',
        totalSqm: 125,
        location: 'Makati',
        notes: 'Integrated command',
        expectedUpdatedAt: observedAt.toISOString(),
      }

      try {
        await request(app.getHttpServer())
          .patch(`/v1/projects/${projectA}`)
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .patch(`/v1/projects/${projectA}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .send(command)
          .expect(403)

        await request(app.getHttpServer())
          .patch(`/v1/projects/${projectB}`)
          .set('Authorization', 'Bearer admin-a-token')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .patch(`/v1/projects/${projectA}`)
          .set('Authorization', 'Bearer admin-a-token')
          .send({
            ...command,
            expectedUpdatedAt: '2026-07-27T00:00:00.000Z',
          })
          .expect(409)

        const response = await request(app.getHttpServer())
          .patch(`/v1/projects/${projectA}`)
          .set('Authorization', 'Bearer admin-a-token')
          .send(command)
          .expect(200)

        expect(response.body).toMatchObject({
          id: projectA,
          tenantId: tenantA,
          name: command.name,
          projectType: command.projectType,
        })

        const [updatedA] = await transaction
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, projectA),
              eq(projects.tenant_id, tenantA)
            )
          )
          .limit(1)
        const [unchangedB] = await transaction
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, projectB),
              eq(projects.tenant_id, tenantB)
            )
          )
          .limit(1)
        const [audit] = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'projects'),
              eq(auditLog.entity_id, projectA),
              eq(auditLog.action, 'update')
            )
          )
          .orderBy(desc(auditLog.id))
          .limit(1)

        expect(updatedA?.name).toBe(command.name)
        expect(unchangedB?.name).toBe('Original B')
        expect(audit?.actor_id).toBe(adminA)
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
