import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import type { ConfigService } from '@nestjs/config'
import {
  auditLog,
  db,
  documentProcessingEvidence,
  documentProcessingJobs,
  documents,
  projects,
  scopeItems,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import type { Job } from 'bullmq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { CadEvidenceCommitService } from '../src/cad/cad-evidence-commit.service'
import { DocumentProcessingDraftBomService } from '../src/cad/document-processing.bom'
import {
  DOCUMENT_PROCESSING_JOB,
} from '../src/cad/document-processing.constants'
import { DocumentProcessingEvidenceService } from '../src/cad/document-processing.evidence'
import { DocumentProcessingProcessor } from '../src/cad/document-processing.processor'
import { DocumentProcessingService } from '../src/cad/document-processing.service'
import { DocumentProcessingStateService } from '../src/cad/document-processing.state'
import type { DocumentProcessingStorageService as StorageService } from '../src/cad/document-processing.storage'
import { DocumentProcessingWorkerClient } from '../src/cad/document-processing.worker'
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

function configFor(tenantId: string): ConfigService {
  const values: Record<string, unknown> = {
    ERP_DOCUMENT_PROCESSING_JOBS_ENABLED: true,
    ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: true,
    ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS: [tenantId],
    ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED: false,
    ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS: [],
    ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED: true,
    ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS: [tenantId],
    DXF_PARSER_URL: 'https://parser.example.test',
    PARSER_SHARED_SECRET: 's'.repeat(32),
  }
  return {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
}

function queueJob(jobId: string): Job {
  return {
    id: `document-processing1-${jobId}`,
    name: DOCUMENT_PROCESSING_JOB,
    data: { schemaVersion: 1, jobId },
    attemptsMade: 0,
    opts: { attempts: 5 },
  } as Job
}

suite('document processing processor database integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('runs one canary job through signed worker, Nest commit, duplicate delivery, and audit rollback', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const userId = randomUUID()
      const projectId = randomUUID()
      const documentId = randomUUID()
      const oldScopeItemId = randomUUID()
      const manualScopeItemId = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantId

      await transaction.insert(tenants).values({
        id: tenantId,
        name: 'Processor Canary Tenant',
        slug: `processor-canary-${suffix}`,
      })
      await transaction.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `processor-canary-${suffix}@integration.test`,
        full_name: 'Processor Canary',
        role: 'pm',
      })
      await transaction.insert(projects).values({
        id: projectId,
        tenant_id: tenantId,
        name: 'Processor Canary Project',
        client: 'Canary Client',
        status: 'active',
        project_type: 'mep',
        created_by: userId,
      })
      await transaction.insert(documents).values({
        id: documentId,
        tenant_id: tenantId,
        project_id: projectId,
        uploaded_by: userId,
        document_type: 'dxf',
        file_name: 'canary-plan.dxf',
        storage_path: `cad/${tenantId}/canary-plan.dxf`,
        mime_type: 'application/dxf',
        size_bytes: 128,
      })
      await transaction.insert(scopeItems).values([
        {
          id: oldScopeItemId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: userId,
          code: 'OLD',
          description: 'Previous extracted line',
          unit: 'unit',
          quantity: 1,
          unit_cost_cents: 100,
          line_total_cents: 100,
          notes: `auto-extracted; document:${documentId}`,
        },
        {
          id: manualScopeItemId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: userId,
          code: 'KEEP',
          description: 'Manual estimate remains',
          unit: 'unit',
          quantity: 1,
          unit_cost_cents: 200,
          line_total_cents: 200,
          notes: 'manual estimate',
        },
      ])

      const config = configFor(tenantId)
      const database = transactionBoundDatabase(transaction)
      const audit = new AuditService()
      const principal: ErpPrincipal = {
        userId,
        tenantId,
        role: 'pm',
        email: `processor-canary-${suffix}@integration.test`,
      }
      const processing = new DocumentProcessingService(
        config,
        database,
        audit
      )
      const created = await processing.create(
        documentId,
        { mode: 'cad', requestedFormat: 'dxf', createDraftBom: false },
        principal,
        'processor-canary-1'
      )
      expect(created.created).toBe(true)

      const signedUrl = vi
        .fn()
        .mockResolvedValue('https://storage.example.test/signed-object')
      const evidence = {
        schema_version: 1,
        job_id: created.status.jobId,
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
            notes: 'worker evidence',
          },
        ],
        warnings: ['canary warning'],
      } as const
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(evidence), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      vi.stubGlobal('fetch', fetchMock)
      const worker = new DocumentProcessingWorkerClient(
        config,
        {
          createSignedUrl: signedUrl,
        } as unknown as StorageService
      )
      const state = new DocumentProcessingStateService(database)
      const evidenceService = new DocumentProcessingEvidenceService(database)
      const commits = new CadEvidenceCommitService(
        config,
        database,
        audit,
        new DocumentProcessingDraftBomService(audit)
      )
      const processor = new DocumentProcessingProcessor(
        config,
        state,
        worker,
        commits,
        evidenceService
      )

      await expect(
        processor.process(queueJob(created.status.jobId))
      ).resolves.toMatchObject({
        status: 'succeeded',
        jobId: created.status.jobId,
        scopeItemsCreated: 1,
        sourceSha256: 'a'.repeat(64),
      })
      await expect(
        processor.process(queueJob(created.status.jobId))
      ).resolves.toEqual({
        status: 'ignored',
        jobId: created.status.jobId,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(signedUrl).toHaveBeenCalledWith(
        `cad/${tenantId}/canary-plan.dxf`
      )

      const rows = await transaction
        .select()
        .from(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, tenantId),
            eq(scopeItems.project_id, projectId)
          )
        )
      expect(rows).toHaveLength(2)
      expect(rows.find((row) => row.id === oldScopeItemId)).toBeUndefined()
      expect(rows.find((row) => row.id === manualScopeItemId)?.description).toBe(
        'Manual estimate remains'
      )
      expect(
        rows.find((row) => row.notes?.includes(`document:${documentId}`))
      ).toMatchObject({
        code: 'DIFFUSER',
        quantity: 2,
        unit_cost_cents: 125,
        line_total_cents: 250,
      })

      const jobs = await transaction
        .select()
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.tenant_id, tenantId),
            eq(documentProcessingJobs.id, created.status.jobId)
          )
        )
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        status: 'succeeded',
        attempt_count: 1,
        scope_item_count: 1,
        warnings: ['canary warning'],
      })

      const evidenceRows = await transaction
        .select()
        .from(documentProcessingEvidence)
        .where(
          and(
            eq(documentProcessingEvidence.tenant_id, tenantId),
            eq(documentProcessingEvidence.job_id, created.status.jobId)
          )
        )
      expect(evidenceRows).toHaveLength(1)
      expect(evidenceRows[0]).toMatchObject({
        document_id: documentId,
        project_id: projectId,
        attempt: 1,
        source_sha256: 'a'.repeat(64),
        item_count: 1,
      })

      const auditRows = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantId),
            eq(auditLog.entity_id, documentId),
            eq(auditLog.action, 'update')
          )
        )
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]?.actor_id).toBe(userId)
      expect(auditRows[0]?.diff).toMatchObject({
        source: 'cad_parser_nest_authority',
        scope_items_replaced: 1,
      })
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)

  it('requeues a stale PostgreSQL claim and increments the next attempt', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const userId = randomUUID()
      const projectId = randomUUID()
      const documentId = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantId

      await transaction.insert(tenants).values({
        id: tenantId,
        name: 'Processor Recovery Tenant',
        slug: `processor-recovery-${suffix}`,
      })
      await transaction.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `processor-recovery-${suffix}@integration.test`,
        full_name: 'Processor Recovery',
        role: 'pm',
      })
      await transaction.insert(projects).values({
        id: projectId,
        tenant_id: tenantId,
        name: 'Processor Recovery Project',
        client: 'Recovery Client',
        status: 'active',
        project_type: 'mep',
        created_by: userId,
      })
      await transaction.insert(documents).values({
        id: documentId,
        tenant_id: tenantId,
        project_id: projectId,
        uploaded_by: userId,
        document_type: 'dxf',
        file_name: 'recovery-plan.dxf',
        storage_path: `cad/${tenantId}/recovery-plan.dxf`,
        mime_type: 'application/dxf',
        size_bytes: 64,
      })

      const config = configFor(tenantId)
      const database = transactionBoundDatabase(transaction)
      const processing = new DocumentProcessingService(
        config,
        database,
        new AuditService()
      )
      const principal: ErpPrincipal = {
        userId,
        tenantId,
        role: 'pm',
        email: `processor-recovery-${suffix}@integration.test`,
      }
      const created = await processing.create(
        documentId,
        { mode: 'cad', requestedFormat: 'dxf', createDraftBom: false },
        principal,
        'processor-recovery-1'
      )
      const state = new DocumentProcessingStateService(database)
      await expect(state.claim(created.status.jobId)).resolves.toMatchObject({
        jobId: created.status.jobId,
        attempt: 1,
      })

      await transaction
        .update(documentProcessingJobs)
        .set({ updated_at: new Date(Date.now() - 10 * 60_000) })
        .where(eq(documentProcessingJobs.id, created.status.jobId))

      await expect(state.recoverableJobIds(new Date())).resolves.toEqual([
        created.status.jobId,
      ])
      await expect(state.claim(created.status.jobId)).resolves.toMatchObject({
        jobId: created.status.jobId,
        attempt: 2,
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
