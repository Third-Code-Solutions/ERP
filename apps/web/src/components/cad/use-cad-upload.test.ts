import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatCompletionProgress,
  notifyComplete,
  releaseReservation,
  signUpload,
  uploadSigningFingerprint,
  type CompleteResponse,
} from './use-cad-upload'

const base: CompleteResponse = {
  id: '44444444-4444-4444-8444-444444444444',
  storagePath: 'tenant/project/drawing.dwg',
  documentType: 'dxf',
  cadFormat: 'dwg',
}

describe('CAD upload progress formatting', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders the Nest-succeeded extraction with the existing summary shape', () => {
    expect(
      formatCompletionProgress({
        ...base,
        cadResult: {
          status: 'succeeded',
          scopeItemsCreated: 4,
          warnings: [],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: null,
          extensionMismatch: false,
          message: 'DWG processed by ERP Core - 4 scope items committed.',
          bomId: null,
          bomTcvCents: 0,
          bomCostCents: 0,
          bomGpMarginBps: 0,
          ragMatches: 0,
          aiEstimateMatches: 0,
          processingJobId: '55555555-5555-4555-8555-555555555555',
        },
      })
    ).toContain('DWG: 4 scope items extracted')
  })

  it('keeps queued processing progress actionable', () => {
    expect(
      formatCompletionProgress({
        ...base,
        cadParseQueued: true,
        cadResult: {
          status: 'queued',
          scopeItemsCreated: 0,
          warnings: [],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: null,
          extensionMismatch: false,
          message: 'DWG processing queued in ERP Core.',
          bomId: null,
          bomTcvCents: 0,
          bomCostCents: 0,
          bomGpMarginBps: 0,
          ragMatches: 0,
          aiEstimateMatches: 0,
          processingJobId: '55555555-5555-4555-8555-555555555555',
        },
      })
    ).toBe('DWG processing queued in ERP Core.')
  })

  it('does not present an AI scope candidate as a priced draft BOM', () => {
    expect(
      formatCompletionProgress({
        ...base,
        cadResult: {
          status: 'extracted',
          scopeItemsCreated: 2,
          warnings: [],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'pdf',
          dwgVersion: null,
          extensionMismatch: false,
          message: 'Created an unpriced candidate BOM.',
          bomId: '55555555-5555-4555-8555-555555555555',
          bomTcvCents: 0,
          bomCostCents: 0,
          bomGpMarginBps: 0,
          ragMatches: 0,
          aiEstimateMatches: 0,
          unpricedCandidateBom: true,
        },
      })
    ).toBe(
      'PDF: 2 scope items extracted · unpriced candidate BOM; resolve the review queue and attach a DUPA'
    )
  })

  it('forwards one stable signing key and completes only by reservation ID', async () => {
    const reservationId = '55555555-5555-4555-8555-555555555555'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: 'https://storage.example.test/upload',
            token: 'signed-token',
            storagePath: 'tenant/project/object.pdf',
            reservationId,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(base), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    await signUpload(
      '33333333-3333-4333-8333-333333333333',
      'drawing.pdf',
      'application/pdf',
      1024,
      'stable-file-attempt-1'
    )
    await notifyComplete({ reservationId })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/upload/sign',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-file-attempt-1',
        },
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/upload/complete',
      expect.objectContaining({
        body: JSON.stringify({ reservationId }),
      })
    )
  })

  it('releases an exact pending reservation through the authenticated route', async () => {
    const reservationId = '55555555-5555-4555-8555-555555555555'
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(releaseReservation(reservationId)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/upload/reservations/${reservationId}`,
      { method: 'DELETE' }
    )
  })

  it('scopes a retained signing key fingerprint to the project', () => {
    const file = {
      name: 'drawing.pdf',
      size: 1024,
      type: 'application/pdf',
      lastModified: 1,
    }

    expect(
      uploadSigningFingerprint(
        '33333333-3333-4333-8333-333333333333',
        file
      )
    ).not.toBe(
      uploadSigningFingerprint(
        '44444444-4444-4444-8444-444444444444',
        file
      )
    )
  })
})
