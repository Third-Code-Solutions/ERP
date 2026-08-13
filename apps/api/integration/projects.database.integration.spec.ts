import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  dailyTasks,
  deliverySchedules,
  documents,
  projectCreateRequests,
  projects,
  progressUpdates,
  purchaseOrders,
  punchlistItems,
  tenants,
  variationOrders,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, desc, eq } from 'drizzle-orm'
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
import { ProjectsController } from '../src/projects/projects.controller'
import { ProjectCommandCenterService } from '../src/projects/project-command-center.service'
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
      const purchaseOrderA = randomUUID()
      const purchaseOrderB = randomUUID()
      const deliveryA = randomUUID()
      const deliveryB = randomUUID()
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
      await transaction.insert(dailyTasks).values([
        {
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: adminA,
          title: 'A overdue task',
          due_date: new Date(Date.now() - 60 * 60 * 1_000),
          status: 'pending',
        },
        {
          tenant_id: tenantB,
          project_id: projectB,
          assignee_id: adminB,
          title: 'B overdue task',
          due_date: new Date(Date.now() - 60 * 60 * 1_000),
          status: 'pending',
        },
      ])
      await transaction.insert(documents).values([
        {
          tenant_id: tenantA,
          project_id: projectA,
          uploaded_by: adminA,
          document_type: 'pdf',
          file_name: 'a-evidence.pdf',
          storage_path: `integration/${suffix}/a-evidence.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 10,
        },
        {
          tenant_id: tenantB,
          project_id: projectB,
          uploaded_by: adminB,
          document_type: 'pdf',
          file_name: 'b-evidence.pdf',
          storage_path: `integration/${suffix}/b-evidence.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 10,
        },
      ])
      await transaction.insert(variationOrders).values([
        {
          tenant_id: tenantA,
          project_id: projectA,
          vo_number: `VO-A-${suffix}`,
          description: 'A pending decision',
          change_type: 'site_condition',
          status: 'pending_client_signature',
          created_by: adminA,
        },
        {
          tenant_id: tenantB,
          project_id: projectB,
          vo_number: `VO-B-${suffix}`,
          description: 'B pending decision',
          change_type: 'site_condition',
          status: 'pending_client_signature',
          created_by: adminB,
        },
      ])
      await transaction.insert(punchlistItems).values([
        {
          tenant_id: tenantA,
          project_id: projectA,
          description: 'A open punchlist',
          priority: 'high',
          status: 'open',
          created_by: adminA,
        },
        {
          tenant_id: tenantB,
          project_id: projectB,
          description: 'B open punchlist',
          priority: 'high',
          status: 'open',
          created_by: adminB,
        },
      ])
      await transaction.insert(purchaseOrders).values([
        {
          id: purchaseOrderA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: adminA,
          po_number: `PO-A-${suffix}`,
          status: 'issued',
        },
        {
          id: purchaseOrderB,
          tenant_id: tenantB,
          project_id: projectB,
          created_by: adminB,
          po_number: `PO-B-${suffix}`,
          status: 'issued',
        },
      ])
      await transaction.insert(deliverySchedules).values([
        {
          id: deliveryA,
          tenant_id: tenantA,
          purchase_order_id: purchaseOrderA,
          status: 'in_transit',
          created_by: adminA,
        },
        {
          id: deliveryB,
          tenant_id: tenantB,
          purchase_order_id: purchaseOrderB,
          status: 'in_transit',
          created_by: adminB,
        },
      ])
      await transaction.insert(progressUpdates).values([
        {
          tenant_id: tenantA,
          project_id: projectA,
          week_ending: new Date(Date.now() - 24 * 60 * 60 * 1_000),
          percent_by_category: { overall_pct: 42 },
          submitted_by: adminA,
        },
        {
          tenant_id: tenantB,
          project_id: projectB,
          week_ending: new Date(Date.now() - 24 * 60 * 60 * 1_000),
          percent_by_category: { overall_pct: 18 },
          submitted_by: adminB,
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
          ProjectCommandCenterService,
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
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string, fallback: unknown) => {
                if (key === 'ERP_PROJECT_CREATE_WRITES_ENABLED') {
                  return true
                }
                if (key === 'ERP_PROJECT_CREATE_WRITES_TENANT_IDS') {
                  return [tenantA, tenantB]
                }
                return fallback
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
          .get(`/v1/projects/${projectA}/command-center`)
          .expect(401)

        const commandCenterA = await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/command-center`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(commandCenterA.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          pendingTasks: 1,
          overdueTasks: 1,
          documents: 1,
          pendingDecisions: 1,
          openPunchlist: 1,
          activeDeliveries: 1,
          progressPercent: 42,
        })
        expect(commandCenterA.body.progressWeekEnding).toEqual(
          expect.any(String)
        )

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/command-center?asOf=2026-08-10T00:00:00.000Z`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}/command-center`)
          .set('Authorization', 'Bearer admin-a-token')
          .expect(404)

        const commandCenterB = await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}/command-center`)
          .set('Authorization', 'Bearer admin-b-token')
          .expect(200)
        expect(commandCenterB.body).toMatchObject({
          tenantId: tenantB,
          projectId: projectB,
          pendingTasks: 1,
          documents: 1,
          pendingDecisions: 1,
          openPunchlist: 1,
          activeDeliveries: 1,
          progressPercent: 18,
        })

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}`)
          .expect(401)

        const viewerRead = await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(viewerRead.body).toMatchObject({
          id: projectA,
          tenantId: tenantA,
          name: 'Original A',
          client: 'Client A',
          status: 'active',
          projectType: 'mep',
          createdBy: adminA,
        })

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}`)
          .set('Authorization', 'Bearer admin-a-token')
          .expect(404)

        const tenantBRead = await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}`)
          .set('Authorization', 'Bearer admin-b-token')
          .expect(200)
        expect(tenantBRead.body).toMatchObject({
          id: projectB,
          tenantId: tenantB,
          name: 'Original B',
          client: 'Client B',
        })

        await request(app.getHttpServer())
          .get('/v1/projects?limit=101')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        const tenantAList = await request(app.getHttpServer())
          .get('/v1/projects?status=active&sort=name&order=asc&limit=1')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(tenantAList.body).toMatchObject({
          page: 1,
          limit: 1,
          total: 1,
          totalPages: 1,
        })
        expect(tenantAList.body.rows).toHaveLength(1)
        expect(tenantAList.body.rows[0]).toMatchObject({
          id: projectA,
          tenantId: tenantA,
        })

        const concealedList = await request(app.getHttpServer())
          .get('/v1/projects?q=Original%20B')
          .set('Authorization', 'Bearer admin-a-token')
          .expect(200)
        expect(concealedList.body).toMatchObject({
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 1,
          rows: [],
        })

        const tenantBList = await request(app.getHttpServer())
          .get('/v1/projects?q=Original%20B')
          .set('Authorization', 'Bearer admin-b-token')
          .expect(200)
        expect(tenantBList.body).toMatchObject({
          total: 1,
          rows: [expect.objectContaining({ id: projectB, tenantId: tenantB })],
        })

        const createCommand = {
          name: 'Created A',
          client: 'Client A',
          status: 'lead',
          projectType: 'fit_out',
          totalSqm: 140,
          location: 'Makati',
          notes: 'Idempotent integration command',
        }

        await request(app.getHttpServer())
          .post('/v1/projects')
          .send(createCommand)
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/projects')
          .set('Authorization', 'Bearer viewer-a-token')
          .set('Idempotency-Key', 'project-create-integration')
          .send(createCommand)
          .expect(403)

        const created = await request(app.getHttpServer())
          .post('/v1/projects')
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'project-create-integration')
          .send(createCommand)
          .expect(201)

        const replay = await request(app.getHttpServer())
          .post('/v1/projects')
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'project-create-integration')
          .send(createCommand)
          .expect(201)

        expect(replay.body).toEqual(created.body)

        await request(app.getHttpServer())
          .post('/v1/projects')
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'project-create-integration')
          .send({ ...createCommand, name: 'Different A' })
          .expect(409)

        const createdB = await request(app.getHttpServer())
          .post('/v1/projects')
          .set('Authorization', 'Bearer admin-b-token')
          .set('Idempotency-Key', 'project-create-integration')
          .send(createCommand)
          .expect(201)

        expect(created.body).toMatchObject({
          tenantId: tenantA,
          name: createCommand.name,
        })
        expect(createdB.body).toMatchObject({ tenantId: tenantB })
        expect(createdB.body.id).not.toBe(created.body.id)

        const requestRows = await transaction
          .select()
          .from(projectCreateRequests)
          .where(eq(projectCreateRequests.idempotency_key, 'project-create-integration'))
        expect(requestRows).toHaveLength(2)
        expect(requestRows.map((row) => row.state)).toEqual([
          'succeeded',
          'succeeded',
        ])

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
