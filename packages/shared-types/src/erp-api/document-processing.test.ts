import { describe, expect, it } from 'vitest'
import {
  documentProcessingAcceptedSchema,
  documentProcessingQueueJobSchema,
  documentProcessingRecoveryJobSchema,
  documentProcessingRequestSchema,
  documentProcessingStatusSchema,
  documentProcessingWorkerRequestSchema,
  documentProcessingWorkerResponseSchema,
} from './document-processing'

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

describe('document processing contracts', () => {
  it('accepts only the bounded CAD request shape', () => {
    expect(
      documentProcessingRequestSchema.parse({
        mode: 'cad',
        requestedFormat: 'auto',
        createDraftBom: true,
      })
    ).toEqual({
      mode: 'cad',
      requestedFormat: 'auto',
      createDraftBom: true,
    })
    expect(() =>
      documentProcessingRequestSchema.parse({
        mode: 'cad',
        requestedFormat: 'auto',
        createDraftBom: true,
        tenantId: DOCUMENT_ID,
      })
    ).toThrow()
  })

  it('keeps queue payload opaque and identity-only', () => {
    expect(
      documentProcessingQueueJobSchema.parse({
        schemaVersion: 1,
        jobId: JOB_ID,
      })
    ).toEqual({ schemaVersion: 1, jobId: JOB_ID })
    expect(() =>
      documentProcessingQueueJobSchema.parse({
        schemaVersion: 1,
        jobId: JOB_ID,
        tenantId: DOCUMENT_ID,
      })
    ).toThrow()
  })

  it('keeps recovery scheduler payload free of tenant and job authority', () => {
    expect(
      documentProcessingRecoveryJobSchema.parse({ schemaVersion: 1 })
    ).toEqual({ schemaVersion: 1 })
    expect(() =>
      documentProcessingRecoveryJobSchema.parse({
        schemaVersion: 1,
        tenantId: DOCUMENT_ID,
      })
    ).toThrow()
  })

  it('requires sanitized status fields and bounded warnings', () => {
    const timestamp = '2026-08-01T13:00:00.000Z'
    expect(
      documentProcessingStatusSchema.parse({
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        status: 'queued',
        attempts: 0,
        scopeItemsCreated: 0,
        draftBomId: null,
        warnings: [],
        failureCode: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    ).toMatchObject({ status: 'queued', warnings: [] })
    expect(() =>
      documentProcessingStatusSchema.parse({
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        status: 'failed',
        attempts: 1,
        scopeItemsCreated: 0,
        draftBomId: null,
        warnings: Array.from({ length: 101 }, () => 'warning'),
        failureCode: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    ).toThrow()
  })

  it('keeps accepted responses queued and free of tenant or actor fields', () => {
    expect(
      documentProcessingAcceptedSchema.parse({
        jobId: JOB_ID,
        status: 'queued',
        documentId: DOCUMENT_ID,
        createdAt: '2026-08-01T13:00:00.000Z',
      })
    ).not.toHaveProperty('tenantId')
    expect(() =>
      documentProcessingAcceptedSchema.parse({
        jobId: JOB_ID,
        status: 'processing',
        documentId: DOCUMENT_ID,
        createdAt: '2026-08-01T13:00:00.000Z',
      })
    ).toThrow()
  })

  it('bounds the private worker request and keeps authority out of it', () => {
    const request = documentProcessingWorkerRequestSchema.parse({
      job_id: JOB_ID,
      attempt: 1,
      source_url: 'https://storage.example.test/object/doc.dxf?token=opaque',
      source_format: 'dxf',
      file_name: 'plan.dxf',
      limits: { max_bytes: 100 * 1024 * 1024, max_items: 5_000 },
    })
    expect(request).not.toHaveProperty('tenant_id')
    expect(request).not.toHaveProperty('project_id')
    expect(request).not.toHaveProperty('actor_id')
    expect(() =>
      documentProcessingWorkerRequestSchema.parse({
        ...request,
        tenant_id: DOCUMENT_ID,
      })
    ).toThrow()
  })

  it('accepts immutable bounded evidence and rejects authority fields', () => {
    const response = documentProcessingWorkerResponseSchema.parse({
      schema_version: 1,
      job_id: JOB_ID,
      attempt: 1,
      source_sha256: 'a'.repeat(64),
      producer: { name: 'third-code-cad-extractor', version: '0.3.0' },
      source_format: 'dwg',
      parsed_format: 'dxf',
      items: [
        {
          item_key: 'b'.repeat(64),
          code: null,
          description: 'Supply air diffuser',
          unit: 'unit',
          quantity: 4,
          recommended_unit_cost_cents: 0,
          notes: null,
        },
      ],
      warnings: [],
    })
    expect(response.items).toHaveLength(1)
    expect(() =>
      documentProcessingWorkerResponseSchema.parse({
        ...response,
        tenant_id: DOCUMENT_ID,
      })
    ).toThrow()
  })
})
