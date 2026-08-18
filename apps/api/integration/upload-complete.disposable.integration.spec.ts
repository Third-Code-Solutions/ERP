import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bomLineItems,
  boms,
  cadEvidenceCommitRequests,
  db,
  documentIntakeRequests,
  documents,
  projects,
  scopeItems,
  tenants,
  users,
} from '@third-code-erp/database'
import { and, eq, like } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { CapabilityGuard } from '../src/auth/capability.guard'
import type { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import { CadEvidenceCommitController } from '../src/cad/cad-evidence-commit.controller'
import { CadEvidenceCommitService } from '../src/cad/cad-evidence-commit.service'
import { DatabaseService } from '../src/database/database.service'
import { POST } from '../../web/src/app/api/upload/complete/route'
import { DocumentIntakeController } from '../src/documents/document-intake.controller'
import { DocumentIntakeService } from '../src/documents/document-intake.service'

const authMocks = vi.hoisted(() => ({
  can: vi.fn(),
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  can: authMocks.can,
  getUser: authMocks.getUser,
  getUserProfile: authMocks.getUserProfile,
  createSupabaseServerClient: authMocks.createSupabaseServerClient,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: authMocks.createSupabaseAdminClient,
  createSupabaseServerClient: authMocks.createSupabaseServerClient,
}))

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../web/public/samples/mep-sample.dxf'
)

function uploadRequest(input: {
  storagePath: string
  projectId: string
  fileName: string
}) {
  return new Request('http://localhost/api/upload/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storagePath: input.storagePath,
      projectId: input.projectId,
      fileName: input.fileName,
      mimeType: 'application/dxf',
      sizeBytes: 46_361,
    }),
  }) as unknown as NextRequest
}

suite('protected Web upload-complete disposable integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('records a real DXF upload through Core without an outstanding job and fails closed without the legacy writer', async () => {
    const fixture = await readFile(FIXTURE_PATH)
    const tenantId = randomUUID()
    const userId = randomUUID()
    const projectId = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const accessToken = 'upload-verified-token'
    const database = new DatabaseService()

    authMocks.getUser.mockResolvedValue({ id: userId })
    authMocks.getUserProfile.mockResolvedValue({
      user: { id: userId },
      tenantId,
      role: 'design',
      email: `upload-complete-${suffix}@integration.test`,
      fullName: 'Upload Complete User',
    })
    authMocks.can.mockReturnValue(true)
    const storageDownload = vi.fn().mockResolvedValue({
      data: new Blob([fixture]),
      error: null,
    })
    const storageFrom = vi.fn().mockReturnValue({ download: storageDownload })
    authMocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: storageFrom },
    })
    authMocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: accessToken } },
        }),
      },
    })

    let app: INestApplication | undefined
    try {
      await db.insert(tenants).values({
        id: tenantId,
        name: 'Upload Complete Tenant',
        slug: `upload-complete-${suffix}`,
      })
      await db.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `upload-complete-${suffix}@integration.test`,
        full_name: 'Upload Complete User',
        role: 'design',
      })
      await db.insert(projects).values({
        id: projectId,
        tenant_id: tenantId,
        name: 'Upload Complete Project',
        client: 'Upload Complete Client',
        status: 'active',
        project_type: 'mep',
        created_by: userId,
      })

      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') return true
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
            return [tenantId]
          }
          return fallback
        }),
      }
      const service = new CadEvidenceCommitService(
        config as never,
        database,
        new AuditService()
      )
      const documentIntakeService = new DocumentIntakeService(
        database,
        new AuditService()
      )
      const identity = {
        verifyAccessToken: vi.fn().mockResolvedValue({ userId }),
      } as unknown as SupabaseIdentityService
      const moduleRef = await Test.createTestingModule({
        controllers: [CadEvidenceCommitController, DocumentIntakeController],
        providers: [
          { provide: CadEvidenceCommitService, useValue: service },
          { provide: DocumentIntakeService, useValue: documentIntakeService },
        ],
      }).compile()
      app = moduleRef.createNestApplication()
      const reflector = new Reflector()
      app.useGlobalGuards(
        new SupabaseJwtGuard(identity, reflector, database),
        new CapabilityGuard(reflector)
      )
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.listen(0, '127.0.0.1')
      const address = app.getHttpServer().address() as AddressInfo
      const coreUrl = `http://127.0.0.1:${address.port}`

      vi.stubEnv('ERP_CORE_API_URL', coreUrl)
      vi.stubEnv('ERP_PROJECT_READS_VIA_API', 'false')
      vi.stubEnv('ERP_PROJECT_READS_VIA_API_TENANT_IDS', '')
      vi.stubEnv('ERP_DOCUMENT_PROCESSING_VIA_API', 'false')
      vi.stubEnv('ERP_DOCUMENT_PROCESSING_TENANT_IDS', '')

      const successStoragePath = `${tenantId}/${projectId}/success-plan.dxf`
      const successResponse = await POST(
        uploadRequest({
          storagePath: successStoragePath,
          projectId,
          fileName: 'success-plan.dxf',
        })
      )
      expect(successResponse.status).toBe(200)
      const successBody = (await successResponse.json()) as {
        id: string
        cadParseQueued: boolean
        cadResult?: {
          status: string
          scopeItemsCreated: number
          detectedFormat: string
        }
      }
      expect(successBody.cadParseQueued).toBe(false)
      expect(successBody.cadResult).toMatchObject({
        status: 'extracted',
        detectedFormat: 'dxf',
      })
      expect(successBody.cadResult?.scopeItemsCreated).toBeGreaterThan(0)
      expect(storageFrom).toHaveBeenCalledWith('documents')
      expect(storageDownload).toHaveBeenCalledWith(successStoragePath)
      expect(identity.verifyAccessToken).toHaveBeenCalledWith(accessToken)

      const successDocument = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, successBody.id),
            eq(documents.tenant_id, tenantId),
            eq(documents.project_id, projectId)
          )
        )
      const successScope = await db
        .select()
        .from(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, tenantId),
            eq(scopeItems.project_id, projectId),
            like(scopeItems.notes, `%document:${successBody.id}%`)
          )
        )
      expect(successDocument).toHaveLength(1)
      expect(successScope).toHaveLength(
        successBody.cadResult?.scopeItemsCreated ?? -1
      )
      expect(
        successScope.reduce((sum, line) => sum + line.line_total_cents, 0)
      ).toBe(
        successScope.reduce(
          (sum, line) => sum + line.quantity * line.unit_cost_cents,
          0
        )
      )
      const successBoms = await db
        .select({ id: boms.id })
        .from(boms)
        .where(
          and(eq(boms.tenant_id, tenantId), eq(boms.project_id, projectId))
        )
      expect(successBoms).toHaveLength(0)

      // Core owns the document transaction as well as the selected CAD commit.
      // An outage must fail before either record reaches a legacy Web writer.
      vi.stubEnv('ERP_CORE_API_URL', 'http://127.0.0.1:9')
      const failedStoragePath = `${tenantId}/${projectId}/core-down-plan.dxf`
      const failedResponse = await POST(
        uploadRequest({
          storagePath: failedStoragePath,
          projectId,
          fileName: 'core-down-plan.dxf',
        })
      )
      expect(failedResponse.status).toBe(503)
      const failedBody = (await failedResponse.json()) as {
        error: string
      }
      expect(failedBody.error).toContain('ERP Core API is unavailable')
      const failedDocuments = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, tenantId),
            eq(documents.storage_path, failedStoragePath)
          )
        )
      const allScopeAfterFailure = await db
        .select()
        .from(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, tenantId),
            eq(scopeItems.project_id, projectId)
          )
        )
      expect(failedDocuments).toHaveLength(0)
      expect(allScopeAfterFailure).toHaveLength(successScope.length)
    } finally {
      await app?.close?.()
      await db.transaction(async (transaction) => {
        await transaction
          .delete(documentIntakeRequests)
          .where(eq(documentIntakeRequests.tenant_id, tenantId))
        await transaction
          .delete(cadEvidenceCommitRequests)
          .where(eq(cadEvidenceCommitRequests.tenant_id, tenantId))
        await transaction
          .delete(bomLineItems)
          .where(eq(bomLineItems.tenant_id, tenantId))
        await transaction.delete(boms).where(eq(boms.tenant_id, tenantId))
        await transaction.delete(scopeItems).where(eq(scopeItems.tenant_id, tenantId))
        await transaction.delete(auditLog).where(eq(auditLog.tenant_id, tenantId))
        await transaction.delete(documents).where(eq(documents.tenant_id, tenantId))
        await transaction.delete(projects).where(eq(projects.tenant_id, tenantId))
        // The audit table's append-only rules make tenant/user removal unsafe
        // in this shared local lane; only the mutable fixture evidence is
        // cleaned here.
      })
    }
  }, 45_000)
})
