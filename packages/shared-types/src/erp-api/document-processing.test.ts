import { describe, expect, it } from 'vitest'
import {
  documentProcessingAcceptedSchema,
  documentProcessingQueueJobSchema,
  documentProcessingRequestSchema,
  documentProcessingStatusSchema,
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
})
