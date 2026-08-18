import { describe, expect, it } from 'vitest'
import {
  documentUploadCompleteResultSchema,
  documentUploadCadResultSchema,
} from './document-upload-complete'

const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'

describe('legacy document upload response contract', () => {
  it('accepts the minimal non-extraction response', () => {
    expect(
      documentUploadCompleteResultSchema.parse({
        id: DOCUMENT_ID,
        storagePath: 'tenant/project/readme.txt',
        documentType: 'other',
        cadFormat: null,
        cadParseQueued: false,
      })
    ).toMatchObject({ id: DOCUMENT_ID, documentType: 'other' })
  })

  it('accepts the full extraction result and negative GP margin', () => {
    const result = documentUploadCompleteResultSchema.parse({
      id: DOCUMENT_ID,
      storagePath: 'tenant/project/drawing.dwg',
      documentType: 'dxf',
      cadFormat: 'dwg',
      cadParseQueued: true,
      cadParseWarning: 'worker queued',
      cadResult: {
        status: 'processing',
        scopeItemsCreated: 0,
        warnings: [],
        layerCount: 2,
        entityCount: 12,
        detectedFormat: 'dwg',
        dwgVersion: 'AC1032',
        extensionMismatch: false,
        message: 'queued',
        bomId: null,
        bomTcvCents: 0,
        bomCostCents: 0,
        bomGpMarginBps: -250,
        ragMatches: 0,
        aiEstimateMatches: 0,
        unpricedCandidateBom: true,
        processingJobId: '99999999-9999-4999-8999-999999999999',
      },
    })
    expect(result.cadResult).toMatchObject({
      bomGpMarginBps: -250,
      unpricedCandidateBom: true,
    })
  })

  it('rejects unknown fields and invalid identifiers', () => {
    expect(() =>
      documentUploadCompleteResultSchema.parse({
        id: 'not-a-uuid',
        storagePath: 'tenant/project/file.txt',
        documentType: 'other',
        cadFormat: null,
      })
    ).toThrow()

    expect(() =>
      documentUploadCadResultSchema.parse({
        status: 'error',
        scopeItemsCreated: 0,
        warnings: [],
        layerCount: 0,
        entityCount: 0,
        detectedFormat: 'unknown',
        dwgVersion: null,
        extensionMismatch: false,
        message: 'bad',
        bomId: null,
        bomTcvCents: 0,
        bomCostCents: 0,
        bomGpMarginBps: 0,
        ragMatches: 0,
        aiEstimateMatches: 0,
        unexpected: true,
      })
    ).toThrow()
  })
})
