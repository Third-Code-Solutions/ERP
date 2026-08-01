import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  db,
  documentProcessingJobs,
  documents,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
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

suite('document processing job database integration', () => {
  it('keeps durable jobs tenant-scoped and idempotent', async () => {
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
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Processing Integration A',
          slug: `processing-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Processing Integration B',
          slug: `processing-integration-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `processing-a-${suffix}@integration.test`,
          full_name: 'Processing A',
          role: 'commercial',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `processing-b-${suffix}@integration.test`,
          full_name: 'Processing B',
          role: 'commercial',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Processing Project A',
          client: 'Processing Client A',
          status: 'active',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Processing Project B',
          client: 'Processing Client B',
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
          file_name: 'plan-a.dxf',
          storage_path: `cad/${tenantA}/plan-a.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 10,
        },
        {
          id: documentB,
          tenant_id: tenantB,
          project_id: projectB,
          uploaded_by: userB,
          document_type: 'dxf',
          file_name: 'plan-b.dxf',
          storage_path: `cad/${tenantB}/plan-b.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 10,
        },
      ])

      const principalA: ErpPrincipal = {
        userId: userA,
        tenantId: tenantA,
        role: 'commercial',
        email: `processing-a-${suffix}@integration.test`,
      }
      const principalB: ErpPrincipal = {
        userId: userB,
        tenantId: tenantB,
        role: 'commercial',
        email: `processing-b-${suffix}@integration.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED') return true
          if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS') {
            return [tenantA]
          }
          return fallback
        }),
      }
      const service = new DocumentProcessingService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const request = {
        mode: 'cad' as const,
        requestedFormat: 'auto' as const,
        createDraftBom: true,
      }

      const first = await service.create(
        documentA,
        request,
        principalA,
        'processing-integration-1'
      )
      const replay = await service.create(
        documentA,
        request,
        principalA,
        'processing-integration-1'
      )
      expect(first).toMatchObject({ created: true, status: { status: 'queued' } })
      expect(replay).toEqual({ created: false, status: first.status })

      await expect(
        service.create(
          documentA,
          { ...request, createDraftBom: false },
          principalA,
          'processing-integration-1'
        )
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        service.create(
          documentB,
          request,
          principalA,
          'processing-cross-tenant'
        )
      ).rejects.toMatchObject({ status: 404 })

      const status = await service.status(first.status.jobId, principalA)
      expect(status).toEqual(first.status)
      await expect(
        service.status(first.status.jobId, principalB)
      ).rejects.toMatchObject({ status: 404 })

      const rows = await transaction
        .select()
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.tenant_id, tenantA),
            eq(
              documentProcessingJobs.idempotency_key,
              'processing-integration-1'
            )
          )
        )
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        tenant_id: tenantA,
        document_id: documentA,
        project_id: projectA,
        created_by: userA,
        status: 'queued',
        attempt_count: 0,
      })
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
