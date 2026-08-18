import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  documentIntakeRequests,
  documents,
  projects,
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
import { DocumentIntakeController } from '../src/documents/document-intake.controller'
import { DocumentIntakeService } from '../src/documents/document-intake.service'

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

suite('Document intake protected HTTP authority', () => {
  it('proves auth, tenant/storage scope, idempotency, audit, RLS, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const adminB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Document Intake HTTP Tenant A',
          slug: `document-intake-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Document Intake HTTP Tenant B',
          slug: `document-intake-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `document-intake-http-admin-a-${suffix}@integration.test`,
          full_name: 'Document Intake Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `document-intake-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Document Intake Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `document-intake-http-admin-b-${suffix}@integration.test`,
          full_name: 'Document Intake Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Tenant A document project',
          client: 'Tenant A client',
          location: 'Site A',
          created_by: adminA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Tenant B document project',
          client: 'Tenant B client',
          location: 'Site B',
          created_by: adminB,
        },
      ])

      const identities = new Map([
        ['document-intake-http-admin-a-token', adminA],
        ['document-intake-http-viewer-a-token', viewerA],
        ['document-intake-http-admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const moduleRef = await Test.createTestingModule({
        controllers: [DocumentIntakeController],
        providers: [
          DocumentIntakeService,
          AuditService,
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
        const route = '/v1/documents'
        const command = {
          storagePath: `${tenantA}/${projectA}/plans.pdf`,
          projectId: projectA,
          fileName: 'plans.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2_048,
          description: 'Approved construction plans',
        }

        await request(app.getHttpServer())
          .post(route)
          .set('Idempotency-Key', 'document-intake-http-1')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'document-intake-http-1')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send({
            ...command,
            projectId: projectB,
            storagePath: `${tenantB}/${projectB}/foreign.pdf`,
          })
          .expect(404)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'outside-scope')
          .send({
            ...command,
            storagePath: `${tenantA}/another-project/plans.pdf`,
          })
          .expect(403)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'document-intake-http-1')
          .send(command)
          .expect(201)
        expect(first.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          storagePath: command.storagePath,
          documentType: 'pdf',
          status: 'created',
          created: true,
        })
        expect(first.body.documentId).toEqual(expect.any(String))

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'document-intake-http-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual({ ...first.body, created: false })

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-intake-http-admin-a-token')
          .set('Idempotency-Key', 'document-intake-http-1')
          .send({ ...command, description: 'Changed after commit' })
          .expect(409)

        const [requestRow] = await transaction
          .select()
          .from(documentIntakeRequests)
          .where(
            and(
              eq(documentIntakeRequests.tenant_id, tenantA),
              eq(
                documentIntakeRequests.idempotency_key,
                'document-intake-http-1'
              )
            )
          )
          .limit(1)
        expect(requestRow).toMatchObject({
          state: 'succeeded',
          project_id: projectA,
          result: expect.objectContaining({
            documentId: first.body.documentId,
            created: true,
          }),
        })

        const [documentRow] = await transaction
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.tenant_id, tenantA),
              eq(documents.id, first.body.documentId)
            )
          )
          .limit(1)
        expect(documentRow).toMatchObject({
          tenant_id: tenantA,
          project_id: projectA,
          uploaded_by: adminA,
          document_type: 'pdf',
          file_name: 'plans.pdf',
          storage_path: command.storagePath,
          mime_type: 'application/pdf',
          size_bytes: 2_048,
        })

        const [auditEntry] = await transaction
          .select({
            action: auditLog.action,
            entityType: auditLog.entity_type,
            entityId: auditLog.entity_id,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'document'),
              eq(auditLog.entity_id, first.body.documentId)
            )
          )
          .limit(1)
        expect(auditEntry).toEqual({
          action: 'create',
          entityType: 'document',
          entityId: first.body.documentId,
        })

        const [tenantADocumentCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(eq(documents.tenant_id, tenantA))
        expect(tenantADocumentCount?.count).toBe(1)

        const [tenantBDocumentCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(eq(documents.tenant_id, tenantB))
        expect(tenantBDocumentCount?.count).toBe(0)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(documentIntakeRequests)
          .where(eq(documentIntakeRequests.tenant_id, tenantB))
        expect(tenantBRequestCount?.count).toBe(0)

        const securityRows = await transaction.execute(sql`
          select
            c.relrowsecurity as "rowSecurity",
            c.relforcerowsecurity as "forceRowSecurity",
            has_table_privilege('authenticated', 'public.document_intake_requests', 'SELECT') as "authenticatedCanSelect",
            has_table_privilege('anon', 'public.document_intake_requests', 'SELECT') as "anonCanSelect"
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'document_intake_requests'
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
  })
})
