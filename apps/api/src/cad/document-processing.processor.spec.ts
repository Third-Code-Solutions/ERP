import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'
import {
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
} from './document-processing.constants'
import { DocumentProcessingProcessor } from './document-processing.processor'
import type { DocumentProcessingStateService } from './document-processing.state'
import type { DocumentProcessingWorkerClient } from './document-processing.worker'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

const CLAIMED = {
  jobId: JOB_ID,
  tenantId: TENANT_ID,
  documentId: DOCUMENT_ID,
  projectId: PROJECT_ID,
  createdBy: '55555555-5555-4555-8555-555555555555',
  role: 'pm' as const,
  email: 'pm@example.test',
  requestedFormat: 'dxf',
  createDraftBom: false,
  storagePath: 'cad/plan.dxf',
  fileName: 'plan.dxf',
  attempt: 1,
}

const WORKER_RESULT = {
  response: {
    document_id: DOCUMENT_ID,
    scope_items: [
      {
        code: null,
        description: 'Office diffuser',
        unit: 'unit',
        quantity: 2,
        unit_cost_cents: 0,
        notes: null,
      },
    ],
    count: 1,
    warnings: [],
    parsed_format: 'dxf' as const,
    source_format: 'dxf' as const,
  },
  sourceSha256: 'a'.repeat(64),
  producer: { name: 'third-code-cad-extractor', version: '0.3.0' },
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: `document-processing1-${JOB_ID}`,
    name: DOCUMENT_PROCESSING_JOB,
    data: { schemaVersion: 1, jobId: JOB_ID },
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...overrides,
  } as Job
}

function harness(createDraftBom = false) {
  const state = {
    claim: vi.fn().mockResolvedValue({ ...CLAIMED, createDraftBom }),
    succeed: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
  } as unknown as DocumentProcessingStateService
  const worker = {
    extract: vi.fn().mockResolvedValue(WORKER_RESULT),
  } as unknown as DocumentProcessingWorkerClient
  const commits = {
    commit: vi.fn().mockResolvedValue({
      documentId: DOCUMENT_ID,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      scopeItemsCreated: 1,
      sourceFormat: 'dxf',
      status: 'committed',
    }),
  } as unknown as CadEvidenceCommitService
  const values: Record<string, unknown> = {
    ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: true,
    ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS: [TENANT_ID],
    ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED: true,
    ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS: [TENANT_ID],
  }
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
  const processor = new DocumentProcessingProcessor(
    config,
    state,
    worker,
    commits
  )
  return { processor, state, worker, commits }
}

describe('DocumentProcessingProcessor', () => {
  it('claims from PostgreSQL, commits through Nest, then closes the job', async () => {
    const probe = harness()
    await expect(probe.processor.process(job())).resolves.toMatchObject({
      status: 'succeeded',
      jobId: JOB_ID,
      scopeItemsCreated: 1,
    })
    expect(probe.worker.extract).toHaveBeenCalledWith(CLAIMED)
    expect(probe.commits.commit).toHaveBeenCalledWith(
      DOCUMENT_ID,
      expect.objectContaining({ projectId: PROJECT_ID }),
      expect.objectContaining({ userId: CLAIMED.createdBy, tenantId: TENANT_ID }),
      `document-processing:${JOB_ID}`
    )
    expect(probe.state.succeed).toHaveBeenCalledWith(JOB_ID, 1, [])
  })

  it('refuses a partial success when draft BOM authority is not wired', async () => {
    const probe = harness(true)
    await expect(probe.processor.process(job())).rejects.toMatchObject({
      code: 'draft_bom_not_implemented',
    })
    expect(probe.worker.extract).not.toHaveBeenCalled()
    expect(probe.commits.commit).not.toHaveBeenCalled()
  })

  it('marks only the final BullMQ attempt as failed', async () => {
    const probe = harness()
    const error = new Error('worker unavailable')
    await probe.processor.onFailed(job({ attemptsMade: 4 }), error)
    expect(probe.state.fail).not.toHaveBeenCalled()
    await probe.processor.onFailed(job({ attemptsMade: 5 }), error)
    expect(probe.state.fail).toHaveBeenCalledWith(JOB_ID, 'processing_failed')
  })
})
