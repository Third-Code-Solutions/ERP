import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  documentProcessingJobs,
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
import { DocumentProcessingController } from '../src/cad/document-processing.controller'
import { DocumentProcessingJobQueue } from '../src/cad/document-processing.queue'
import { DocumentProcessingService } from '../src/cad/document-processing.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'

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

suite('Document processing protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, queue identity, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const adminB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const documentA = randomUUID()
    const documentB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      observedTenantId = tenantA
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Document processing HTTP tenant A',
          slug: `document-processing-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Document processing HTTP tenant B',
          slug: `document-processing-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `document-processing-http-admin-a-${suffix}@integration.test`,
          full_name: 'Document processing admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `document-processing-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Document processing viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `document-processing-http-admin-b-${suffix}@integration.test`,
          full_name: 'Document processing admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Document processing project A',
          client: 'Tenant A client',
          location: 'Site A',
          created_by: adminA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Document processing project B',
          client: 'Tenant B client',
          location: 'Site B',
          created_by: adminB,
        },
      ])
      await transaction.insert(documents).values([
        {
          id: documentA,
          tenant_id: tenantA,
          project_id: projectA,
          uploaded_by: adminA,
          document_type: 'dxf',
          file_name: 'site-a.dxf',
          storage_path: `cad/${tenantA}/site-a.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 128,
        },
        {
          id: documentB,
          tenant_id: tenantB,
          project_id: projectB,
          uploaded_by: adminB,
          document_type: 'dxf',
          file_name: 'site-b.dxf',
          storage_path: `cad/${tenantB}/site-b.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 128,
        },
      ])

      const identities = new Map([
        ['document-processing-http-admin-a-token', adminA],
        ['document-processing-http-viewer-a-token', viewerA],
        ['document-processing-http-admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        jobsEnabled: true,
        workerBridgeEnabled: true,
        evidenceCommitEnabled: true,
        draftBomEnabled: true,
        jobTenantIds: [tenantA, tenantB],
        evidenceTenantIds: [tenantA, tenantB],
        draftBomTenantIds: [tenantA],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED') {
            return featureState.jobsEnabled
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED') {
            return featureState.workerBridgeEnabled
          }
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') {
            return featureState.evidenceCommitEnabled
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED') {
            return featureState.draftBomEnabled
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS') {
            return featureState.jobTenantIds
          }
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
            return featureState.evidenceTenantIds
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS') {
            return featureState.draftBomTenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService
      const enqueuedJobIds: string[] = []
      const enqueue = vi.fn(async (jobId: string) => {
        enqueuedJobIds.push(jobId)
        return { jobId, enqueued: true }
      })

      const moduleRef = await Test.createTestingModule({
        controllers: [DocumentProcessingController],
        providers: [
          DocumentProcessingService,
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
            provide: DocumentProcessingJobQueue,
            useValue: { enqueue },
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
        const route = `/v1/documents/${documentA}/processing-jobs`
        const statusRoute = (jobId: string) =>
          `/v1/document-processing-jobs/${jobId}`
        const command = {
          mode: 'cad',
          requestedFormat: 'auto',
          createDraftBom: true,
        }

        await request(app.getHttpServer())
          .post(route)
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'document-processing-http-1')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.jobsEnabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.jobsEnabled = true

        featureState.draftBomEnabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'draft-disabled')
          .send(command)
          .expect(503)
        featureState.draftBomEnabled = true

        await request(app.getHttpServer())
          .post(`/v1/documents/${documentB}/processing-jobs`)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', ' document-processing-http-1 ')
          .send(command)
          .expect(202)
        expect(first.body).toMatchObject({
          jobId: expect.any(String),
          status: 'queued',
          documentId: documentA,
          createdAt: expect.any(String),
        })
        expect(enqueuedJobIds).toEqual([first.body.jobId])

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'document-processing-http-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual(first.body)
        expect(enqueuedJobIds).toEqual([first.body.jobId])

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .set('Idempotency-Key', 'document-processing-http-1')
          .send({ ...command, createDraftBom: false })
          .expect(409)

        const status = await request(app.getHttpServer())
          .get(statusRoute(first.body.jobId))
          .set('Authorization', 'Bearer document-processing-http-admin-a-token')
          .expect(200)
        expect(status.body).toMatchObject({
          jobId: first.body.jobId,
          documentId: documentA,
          status: 'queued',
          attempts: 0,
          scopeItemsCreated: 0,
          draftBomId: null,
          warnings: [],
          failureCode: null,
        })

        const viewerStatus = await request(app.getHttpServer())
          .get(statusRoute(first.body.jobId))
          .set('Authorization', 'Bearer document-processing-http-viewer-a-token')
          .expect(200)
        expect(viewerStatus.body).toEqual(status.body)

        await request(app.getHttpServer())
          .get(statusRoute(first.body.jobId))
          .set('Authorization', 'Bearer document-processing-http-admin-b-token')
          .expect(404)

        const [jobRow] = await transaction
          .select()
          .from(documentProcessingJobs)
          .where(
            and(
              eq(documentProcessingJobs.tenant_id, tenantA),
              eq(
                documentProcessingJobs.idempotency_key,
                'document-processing-http-1'
              )
            )
          )
          .limit(1)
        expect(jobRow).toMatchObject({
          tenant_id: tenantA,
          document_id: documentA,
          project_id: projectA,
          created_by: adminA,
          status: 'queued',
          attempt_count: 0,
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
              eq(auditLog.entity_type, 'document_processing_job'),
              eq(auditLog.entity_id, first.body.jobId)
            )
          )
          .limit(1)
        expect(auditEntry).toEqual({
          action: 'create',
          entityType: 'document_processing_job',
          entityId: first.body.jobId,
        })

        const [tenantBJobCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(documentProcessingJobs)
          .where(eq(documentProcessingJobs.tenant_id, tenantB))
        expect(tenantBJobCount?.count).toBe(0)
      } finally {
        await app.close()
      }
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, observedTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 45_000)
})
