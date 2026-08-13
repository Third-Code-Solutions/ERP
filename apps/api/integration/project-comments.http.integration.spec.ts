import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  projectCommentCreateRequests,
  projectCommentDeleteRequests,
  projectComments,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, inArray } from 'drizzle-orm'
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
import { RequestObservabilityMiddleware } from '../src/observability/request-observability.middleware'
import { ProjectCommentCreationService } from '../src/projects/project-comment-creation.service'
import { ProjectCommentDeletionService } from '../src/projects/project-comment-deletion.service'
import { ProjectCommentListService } from '../src/projects/project-comment-list.service'
import { CreateProjectCommentPipe } from '../src/projects/project-comment.pipe'
import { ProjectCommentsController } from '../src/projects/project-comments.controller'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'

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

suite('Project comments protected HTTP canary', () => {
  it('proves guarded create/delete, tenant scope, idempotency, audit, disablement, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const authorA = randomUUID()
    const viewerA = randomUUID()
    const authorB = randomUUID()
    const mentionA = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const commentToDelete = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Project Comment HTTP Tenant A',
          slug: `project-comment-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Project Comment HTTP Tenant B',
          slug: `project-comment-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: authorA,
          tenant_id: tenantA,
          email: `project-comment-author-a-${suffix}@integration.test`,
          full_name: 'Project Comment Author A',
          role: 'pm',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `project-comment-viewer-a-${suffix}@integration.test`,
          full_name: 'Project Comment Viewer A',
          role: 'viewer',
        },
        {
          id: authorB,
          tenant_id: tenantB,
          email: `project-comment-author-b-${suffix}@integration.test`,
          full_name: 'Project Comment Author B',
          role: 'pm',
        },
        {
          id: mentionA,
          tenant_id: tenantA,
          email: `project-comment-mention-a-${suffix}@integration.test`,
          full_name: 'Project Comment Mention A',
          role: 'viewer',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Project Comment HTTP A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: authorA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Project Comment HTTP B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: authorB,
        },
      ])
      await transaction.insert(projectComments).values([
        {
          id: commentToDelete,
          tenant_id: tenantA,
          project_id: projectA,
          author_id: authorA,
          body: 'Delete this correction note.',
          mentions: [],
          created_at: new Date('2026-08-09T10:00:00.000Z'),
          updated_at: new Date('2026-08-09T10:00:00.000Z'),
        },
      ])

      const identities = new Map([
        ['pm-a-token', authorA],
        ['viewer-a-token', viewerA],
        ['pm-b-token', authorB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (
            key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED' ||
            key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED'
          ) {
            return true
          }
          if (
            key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS' ||
            key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS'
          ) {
            return [tenantA]
          }
          return fallback
        }),
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectCommentsController],
        providers: [
          Reflector,
          CreateProjectCommentPipe,
          ProjectCommentCreationService,
          ProjectCommentDeletionService,
          ProjectCommentListService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: DatabaseService,
            useValue: database,
          },
          {
            provide: SupabaseIdentityService,
            useValue: identity,
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
      const observability = new RequestObservabilityMiddleware()
      app.use(observability.use.bind(observability))
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()

      const body = `Delivery is ready for @project-comment-mention-a-${suffix}@integration.test.`
      try {
        await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/comments`)
          .expect(401)

        const initialRead = await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/comments?limit=1`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(initialRead.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          limit: 1,
          hasMore: false,
        })
        expect(initialRead.body.items).toHaveLength(1)
        expect(initialRead.body.items[0]).toMatchObject({
          id: commentToDelete,
          tenantId: tenantA,
          projectId: projectA,
          authorId: authorA,
          body: 'Delete this correction note.',
        })

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/comments?limit=101`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/comments?tenantId=${tenantA}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .expect(404)

        const tenantBRead = await request(app.getHttpServer())
          .get(`/v1/projects/${projectB}/comments`)
          .set('Authorization', 'Bearer pm-b-token')
          .expect(200)
        expect(tenantBRead.body).toMatchObject({
          tenantId: tenantB,
          projectId: projectB,
          limit: 100,
          hasMore: false,
          items: [],
        })

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .send({ projectId: projectA, body })
          .expect(401)

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer viewer-a-token')
          .set('Idempotency-Key', 'viewer-comment')
          .send({ projectId: projectA, body })
          .expect(403)

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .send({ projectId: projectA, body })
          .expect(400)

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'route-mismatch')
          .send({ projectId: projectB, body })
          .expect(400)

        const createResponse = await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'comment-create-http')
          .set('x-request-id', REQUEST_ID)
          .send({ projectId: projectA, body })
          .expect(201)
        expect(createResponse.headers['x-request-id']).toBe(REQUEST_ID)
        expect(createResponse.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          authorId: authorA,
          body,
          mentions: [mentionA],
          created: true,
        })
        const createdCommentId = createResponse.body.commentId as string

        const replayResponse = await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'comment-create-http')
          .send({ projectId: projectA, body })
          .expect(201)
        expect(replayResponse.body).toEqual(createResponse.body)

        const populatedRead = await request(app.getHttpServer())
          .get(`/v1/projects/${projectA}/comments?limit=1`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(populatedRead.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          limit: 1,
          hasMore: true,
        })
        expect(populatedRead.body.items[0]).toMatchObject({
          id: createResponse.body.commentId,
          body,
          mentions: [mentionA],
        })

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectA}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'comment-create-http')
          .send({ projectId: projectA, body: 'Different body.' })
          .expect(409)

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectB}/comments`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'foreign-project')
          .send({ projectId: projectB, body })
          .expect(404)

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectB}/comments`)
          .set('Authorization', 'Bearer pm-b-token')
          .set('Idempotency-Key', 'disabled-tenant')
          .send({ projectId: projectB, body })
          .expect(503)

        const createdRows = await transaction
          .select()
          .from(projectComments)
          .where(eq(projectComments.id, createdCommentId))
        expect(createdRows).toHaveLength(1)
        expect(createdRows[0]).toMatchObject({
          tenant_id: tenantA,
          project_id: projectA,
          author_id: authorA,
          body,
          mentions: [mentionA],
        })

        const createRequests = await transaction
          .select()
          .from(projectCommentCreateRequests)
          .where(eq(projectCommentCreateRequests.tenant_id, tenantA))
        expect(createRequests).toHaveLength(1)
        expect(createRequests[0]).toMatchObject({
          state: 'succeeded',
          comment_id: createdCommentId,
        })

        const deleteMissingKey = await request(app.getHttpServer())
          .delete(`/v1/projects/${projectA}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer pm-a-token')
          .expect(400)
        expect(deleteMissingKey.body.message).toBe(
          'Idempotency-Key header is required'
        )

        await request(app.getHttpServer())
          .delete(`/v1/projects/${projectA}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .set('Idempotency-Key', 'viewer-delete')
          .expect(403)

        const deleteResponse = await request(app.getHttpServer())
          .delete(`/v1/projects/${projectA}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'comment-delete-http')
          .expect(200)
        expect(deleteResponse.body).toEqual({
          commentId: commentToDelete,
          tenantId: tenantA,
          projectId: projectA,
          deleted: true,
        })

        const deleteReplay = await request(app.getHttpServer())
          .delete(`/v1/projects/${projectA}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'comment-delete-http')
          .expect(200)
        expect(deleteReplay.body).toEqual(deleteResponse.body)

        await request(app.getHttpServer())
          .delete(`/v1/projects/${projectB}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer pm-a-token')
          .set('Idempotency-Key', 'foreign-delete')
          .expect(404)

        await request(app.getHttpServer())
          .delete(`/v1/projects/${projectB}/comments/${commentToDelete}`)
          .set('Authorization', 'Bearer pm-b-token')
          .set('Idempotency-Key', 'disabled-delete')
          .expect(503)

        const deletedRows = await transaction
          .select({ id: projectComments.id })
          .from(projectComments)
          .where(eq(projectComments.id, commentToDelete))
        expect(deletedRows).toEqual([])

        const deleteRequests = await transaction
          .select()
          .from(projectCommentDeleteRequests)
          .where(eq(projectCommentDeleteRequests.tenant_id, tenantA))
        expect(deleteRequests).toHaveLength(1)
        expect(deleteRequests[0]).toMatchObject({
          project_id: projectA,
          comment_id: null,
          state: 'succeeded',
        })

        const auditRows = await transaction
          .select({ entityId: auditLog.entity_id, action: auditLog.action })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'project_comment'),
              inArray(auditLog.entity_id, [createdCommentId, commentToDelete])
            )
          )
        expect(auditRows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ entityId: createdCommentId, action: 'create' }),
            expect.objectContaining({ entityId: commentToDelete, action: 'delete' }),
          ])
        )
        expect(auditRows).toHaveLength(2)
      } finally {
        await app.close()
      }
    })

    const rolledBackRows = await db
      .select({ id: projectComments.id })
      .from(projectComments)
      .where(inArray(projectComments.id, [commentToDelete]))
    expect(rolledBackRows).toEqual([])

    const rolledBackTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(inArray(tenants.id, [tenantA, tenantB]))
    expect(rolledBackTenants).toEqual([])

    const rolledBackAudits = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenant_id, tenantA),
          eq(auditLog.entity_type, 'project_comment')
        )
      )
    expect(rolledBackAudits).toEqual([])
  }, 30_000)
})
