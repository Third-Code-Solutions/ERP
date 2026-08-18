import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  boms,
  cadEvidenceCommitRequests,
  db,
  documents,
  projects,
  scopeItems,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CadEvidenceCommitController } from '../src/cad/cad-evidence-commit.controller'
import { CadEvidenceCommitService } from '../src/cad/cad-evidence-commit.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import type { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { commitCadEvidenceThroughCoreApi } from '../../web/src/lib/erp-core-client'
import { parseCadEvidence } from '../../web/src/lib/cad/parse-and-store'

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

const ROLLBACK = Symbol('rollback')
const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../web/public/samples/mep-sample.dxf'
)

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
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

suite('CAD Web parser to protected Core HTTP integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('parses the real DXF fixture, commits through protected HTTP, replays idempotently, and rolls back', async () => {
    const fixture = await readFile(FIXTURE_PATH)
    const storageDownload = vi.fn().mockResolvedValue({
      data: new Blob([fixture]),
      error: null,
    })
    const storageFrom = vi.fn().mockReturnValue({ download: storageDownload })
    const accessToken = 'verified-token'
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: storageFrom },
    })
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: accessToken } },
        }),
      },
    })

    let probeTenantId = ''
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const documentA = randomUUID()
      const documentB = randomUUID()
      const oldItem = randomUUID()
      const manualItem = randomUUID()
      const otherTenantItem = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      const storagePath = `cad/${tenantA}/parser-http-plan.dxf`
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Parser HTTP Tenant A',
          slug: `parser-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Parser HTTP Tenant B',
          slug: `parser-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `parser-http-a-${suffix}@integration.test`,
          full_name: 'Parser HTTP A',
          role: 'design',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `parser-http-b-${suffix}@integration.test`,
          full_name: 'Parser HTTP B',
          role: 'design',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Parser HTTP Project A',
          client: 'Parser HTTP Client A',
          status: 'active',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Parser HTTP Project B',
          client: 'Parser HTTP Client B',
          status: 'active',
          project_type: 'mep',
          created_by: userB,
        },
      ])
      await transaction.insert(documents).values([
        {
          id: documentA,
          tenant_id: tenantA,
          project_id: projectA,
          uploaded_by: userA,
          document_type: 'dxf',
          file_name: 'parser-http-plan.dxf',
          storage_path: storagePath,
          mime_type: 'application/dxf',
          size_bytes: fixture.byteLength,
        },
        {
          id: documentB,
          tenant_id: tenantB,
          project_id: projectB,
          uploaded_by: userB,
          document_type: 'dxf',
          file_name: 'other-tenant-plan.dxf',
          storage_path: `cad/${tenantB}/other-tenant-plan.dxf`,
          mime_type: 'application/dxf',
          size_bytes: fixture.byteLength,
        },
      ])
      await transaction.insert(scopeItems).values([
        {
          id: oldItem,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: userA,
          code: 'OLD',
          description: 'Old parser line',
          unit: 'unit',
          quantity: 1,
          unit_cost_cents: 100,
          line_total_cents: 100,
          notes: `auto-extracted; document:${documentA}`,
        },
        {
          id: manualItem,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: userA,
          code: 'KEEP',
          description: 'Manual estimate remains',
          unit: 'unit',
          quantity: 1,
          unit_cost_cents: 200,
          line_total_cents: 200,
          notes: 'manual estimate',
        },
        {
          id: otherTenantItem,
          tenant_id: tenantB,
          project_id: projectB,
          created_by: userB,
          code: 'B',
          description: 'Other tenant line',
          unit: 'unit',
          quantity: 1,
          unit_cost_cents: 300,
          line_total_cents: 300,
          notes: `auto-extracted; document:${documentB}`,
        },
      ])

      const database = transactionBoundDatabase(transaction)
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') return true
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
            return [tenantA]
          }
          return fallback
        }),
      }
      const service = new CadEvidenceCommitService(
        config as never,
        database,
        new AuditService()
      )
      const identity = {
        verifyAccessToken: vi.fn().mockResolvedValue({ userId: userA }),
      } as unknown as SupabaseIdentityService
      const moduleRef = await Test.createTestingModule({
        controllers: [CadEvidenceCommitController],
        providers: [
          { provide: CadEvidenceCommitService, useValue: service },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
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
      try {
        const address = app.getHttpServer().address() as AddressInfo
        const coreUrl = `http://127.0.0.1:${address.port}`
        vi.stubEnv('ERP_CORE_API_URL', coreUrl)

        const unauthenticated = await fetch(
          `${coreUrl}/v1/documents/${documentA}/cad-evidence`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'Idempotency-Key': 'cad-parser-http-unauthenticated',
            },
            body: JSON.stringify({ projectId: projectA, workerResponse: {} }),
          }
        )
        expect(unauthenticated.status).toBe(401)

        const evidence = await parseCadEvidence({
          tenantId: tenantA,
          projectId: projectA,
          documentId: documentA,
          storagePath,
          fileName: 'parser-http-plan.dxf',
          actorId: userA,
        })
        expect(evidence.status).toBe('extracted')
        expect(evidence.detectedFormat).toBe('dxf')
        expect(evidence.extensionMismatch).toBe(false)
        expect(evidence.layerCount).toBeGreaterThan(0)
        expect(evidence.entityCount).toBeGreaterThan(0)
        expect(evidence.scopeItemsCreated).toBe(0)
        expect(evidence.bom).toBeNull()
        expect(evidence.workerResponse).not.toBeNull()
        if (!evidence.workerResponse) throw new Error('parser returned no worker response')
        const workerResponse = evidence.workerResponse
        expect(workerResponse.document_id).toBe(documentA)
        expect(workerResponse.count).toBe(workerResponse.scope_items.length)
        expect(storageFrom).toHaveBeenCalledWith('documents')
        expect(storageDownload).toHaveBeenCalledWith(storagePath)

        const command = {
          projectId: projectA,
          workerResponse,
        }
        const committed = await commitCadEvidenceThroughCoreApi(
          documentA,
          command,
          'cad-parser-http-1',
          tenantA
        )
        expect(identity.verifyAccessToken).toHaveBeenCalledWith(accessToken)
        expect(committed).toEqual({
          ok: true,
          status: 200,
          data: {
            documentId: documentA,
            projectId: projectA,
            tenantId: tenantA,
            scopeItemsCreated: workerResponse.count,
            sourceFormat: workerResponse.source_format,
            status: 'committed',
          },
        })
        await expect(
          commitCadEvidenceThroughCoreApi(
            documentA,
            command,
            'cad-parser-http-1',
            tenantA
          )
        ).resolves.toEqual(committed)

        const crossTenant = await commitCadEvidenceThroughCoreApi(
          documentB,
          {
            projectId: projectB,
            workerResponse: { ...workerResponse, document_id: documentB },
          },
          'cad-parser-http-cross-tenant',
          tenantA
        )
        expect(crossTenant).toMatchObject({ ok: false, status: 404 })

        const tenantALines = await transaction
          .select()
          .from(scopeItems)
          .where(
            and(
              eq(scopeItems.tenant_id, tenantA),
              eq(scopeItems.project_id, projectA)
            )
          )
        const tenantBLines = await transaction
          .select()
          .from(scopeItems)
          .where(
            and(
              eq(scopeItems.tenant_id, tenantB),
              eq(scopeItems.project_id, projectB)
            )
          )
        const extractedLines = tenantALines.filter((line) =>
          line.notes?.includes(`document:${documentA}`)
        )
        const expectedTotal = workerResponse.scope_items.reduce(
          (sum, item) => sum + item.quantity * item.unit_cost_cents,
          0
        )
        expect(extractedLines).toHaveLength(workerResponse.count)
        expect(
          extractedLines.reduce((sum, line) => sum + line.line_total_cents, 0)
        ).toBe(expectedTotal)
        expect(tenantALines.find((line) => line.id === oldItem)).toBeUndefined()
        expect(
          tenantALines.find((line) => line.id === manualItem)?.description
        ).toBe('Manual estimate remains')
        expect(tenantBLines).toHaveLength(1)

        const requests = await transaction
          .select()
          .from(cadEvidenceCommitRequests)
          .where(
            and(
              eq(cadEvidenceCommitRequests.tenant_id, tenantA),
              eq(
                cadEvidenceCommitRequests.idempotency_key,
                'cad-parser-http-1'
              )
            )
          )
        const draftBoms = await transaction
          .select({ id: boms.id })
          .from(boms)
          .where(
            and(eq(boms.tenant_id, tenantA), eq(boms.project_id, projectA))
          )
        const audits = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, documentA),
              eq(auditLog.action, 'update')
            )
          )
        expect(requests).toHaveLength(1)
        expect(requests[0]?.state).toBe('succeeded')
        expect(requests[0]?.scope_item_count).toBe(workerResponse.count)
        expect(draftBoms).toHaveLength(0)
        expect(audits).toHaveLength(1)
        expect(audits[0]?.actor_id).toBe(userA)
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
  }, 45_000)
})
