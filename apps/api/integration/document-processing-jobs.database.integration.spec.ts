import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  db,
  bomLineItems,
  boms,
  documentProcessingEvidence,
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
import { CadEvidenceCommitService } from '../src/cad/cad-evidence-commit.service'
import {
  DocumentProcessingDraftBomService,
  type DraftBomCommitContext,
} from '../src/cad/document-processing.bom'
import { DocumentProcessingService } from '../src/cad/document-processing.service'
import { DocumentProcessingEvidenceService } from '../src/cad/document-processing.evidence'
import { DocumentProcessingStateService } from '../src/cad/document-processing.state'
import type { DocumentProcessingWorkerResult } from '../src/cad/document-processing.worker'
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
          if (key === 'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED') {
            return true
          }
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') return true
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
            return [tenantA]
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED') {
            return true
          }
          if (key === 'ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS') {
            return [tenantA]
          }
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

      const state = new DocumentProcessingStateService(
        transactionBoundDatabase(transaction)
      )
      const claimed = await state.claim(first.status.jobId)
      expect(claimed).toMatchObject({
        jobId: first.status.jobId,
        tenantId: tenantA,
        documentId: documentA,
        attempt: 1,
      })
      expect(await state.fail(first.status.jobId, 'worker_unavailable')).toBe(
        true
      )
      await expect(service.status(first.status.jobId, principalA)).resolves.toMatchObject({
        status: 'failed',
        attempts: 1,
        failureCode: 'worker_unavailable',
      })

      const second = await service.create(
        documentA,
        { ...request, createDraftBom: false },
        principalA,
        'processing-integration-2'
      )
      const secondClaim = await state.claim(second.status.jobId)
      expect(secondClaim?.attempt).toBe(1)
      expect(await state.succeed(second.status.jobId, 2, ['bounded warning'])).toBe(
        true
      )
      await expect(service.status(second.status.jobId, principalA)).resolves.toMatchObject({
        status: 'succeeded',
        attempts: 1,
        scopeItemsCreated: 2,
        warnings: ['bounded warning'],
      })
      await expect(state.claim(second.status.jobId)).resolves.toBeNull()

      const third = await service.create(
        documentA,
        request,
        principalA,
        'processing-integration-3'
      )
      const thirdClaim = await state.claim(third.status.jobId)
      expect(thirdClaim?.attempt).toBe(1)
      if (!thirdClaim) throw new Error('third processing job was not claimed')

      const workerResult: DocumentProcessingWorkerResult = {
        evidence: {
          schema_version: 1,
          job_id: third.status.jobId,
          attempt: 1,
          source_sha256: 'a'.repeat(64),
          producer: {
            name: 'third-code-cad-extractor',
            version: '0.3.0',
          },
          source_format: 'dxf',
          parsed_format: 'dxf',
          items: [
            {
              item_key: 'b'.repeat(64),
              code: 'DIFFUSER',
              description: 'Office diffuser',
              unit: 'unit',
              quantity: 2,
              recommended_unit_cost_cents: 125,
              notes: 'CAD evidence',
            },
          ],
          warnings: ['CAD warning'],
        },
        response: {
          document_id: documentA,
          scope_items: [
            {
              code: 'DIFFUSER',
              description: 'Office diffuser',
              unit: 'unit',
              quantity: 2,
              unit_cost_cents: 125,
              notes: 'CAD evidence',
            },
          ],
          count: 1,
          warnings: ['CAD warning'],
          parsed_format: 'dxf',
          source_format: 'dxf',
        },
        sourceSha256: 'a'.repeat(64),
        producer: {
          name: 'third-code-cad-extractor',
          version: '0.3.0',
        },
      }
      const evidenceService = new DocumentProcessingEvidenceService(
        transactionBoundDatabase(transaction)
      )
      const evidenceId = await evidenceService.persist(
        thirdClaim,
        workerResult
      )
      await expect(
        evidenceService.persist(thirdClaim, workerResult)
      ).resolves.toBe(evidenceId)

      const commitService = new CadEvidenceCommitService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService(),
        new DocumentProcessingDraftBomService(
          new AuditService()
        )
      )
      const draftBomContext: DraftBomCommitContext = {
        job: thirdClaim,
        result: workerResult,
        evidenceId,
      }
      const commitResult = await commitService.commit(
        documentA,
        {
          projectId: projectA,
          workerResponse: workerResult.response,
        },
        principalA,
        'processing-integration-3',
        draftBomContext
      )
      expect(draftBomContext.draftBomId).toBeDefined()
      const replayContext: DraftBomCommitContext = {
        job: thirdClaim,
        result: workerResult,
        evidenceId,
      }
      await expect(
        commitService.commit(
          documentA,
          {
            projectId: projectA,
            workerResponse: workerResult.response,
          },
          principalA,
          'processing-integration-3',
          replayContext
        )
      ).resolves.toEqual(commitResult)
      expect(replayContext.draftBomId).toBe(draftBomContext.draftBomId)
      await expect(
        state.succeed(
          third.status.jobId,
          commitResult.scopeItemsCreated,
          workerResult.evidence.warnings,
          draftBomContext.draftBomId
        )
      ).resolves.toBe(true)
      await expect(service.status(third.status.jobId, principalA)).resolves.toMatchObject({
        status: 'succeeded',
        draftBomId: draftBomContext.draftBomId,
      })

      const evidenceRows = await transaction
        .select()
        .from(documentProcessingEvidence)
        .where(
          and(
            eq(documentProcessingEvidence.tenant_id, tenantA),
            eq(documentProcessingEvidence.job_id, third.status.jobId)
          )
        )
      const bomRows = await transaction
        .select()
        .from(boms)
        .where(
          and(
            eq(boms.tenant_id, tenantA),
            eq(boms.id, draftBomContext.draftBomId as string)
          )
        )
      const bomLines = await transaction
        .select()
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.tenant_id, tenantA),
            eq(bomLineItems.bom_id, draftBomContext.draftBomId as string)
          )
        )
      expect(evidenceRows).toHaveLength(1)
      expect(evidenceRows[0]).toMatchObject({
        tenant_id: tenantA,
        document_id: documentA,
        project_id: projectA,
        attempt: 1,
        source_sha256: 'a'.repeat(64),
        item_count: 1,
      })
      expect(bomRows).toHaveLength(1)
      // Worker recommendations are evidence only. The draft BOM remains
      // unpriced until a DUPA or estimator action supplies an authoritative
      // rate, so CAD output cannot silently become a commercial commitment.
      expect(bomRows[0]?.total_cost_cents).toBe(0)
      expect(bomLines).toHaveLength(1)
      expect(bomLines[0]?.unit_rate_source).toBe('manual')
      expect(bomLines[0]?.unit_cost_cents).toBe(0)
      expect(bomLines[0]?.line_total_cents).toBe(0)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
