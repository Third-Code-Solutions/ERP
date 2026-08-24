import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  completeDocumentUploadReservationThroughCoreApi: vi.fn(),
  createDocumentThroughCoreApi: vi.fn(),
  documentUploadReservationIssuanceUsesCoreApi: vi.fn(),
  documentUploadReservationWritesUseCoreApi: vi.fn(),
  parseCadEvidence: vi.fn(),
  commitCadEvidenceThroughCoreApi: vi.fn(),
  documentProcessingJobsUseCoreApi: vi.fn(),
  enqueueDocumentProcessingThroughCoreApi: vi.fn(),
  extractDeterministicDocument: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/cad/parse-and-store', () => ({
  parseCadEvidence: mocks.parseCadEvidence,
}))

vi.mock('@/lib/erp-core-client', () => ({
  commitCadEvidenceThroughCoreApi: mocks.commitCadEvidenceThroughCoreApi,
  completeDocumentUploadReservationThroughCoreApi:
    mocks.completeDocumentUploadReservationThroughCoreApi,
  createDocumentThroughCoreApi: mocks.createDocumentThroughCoreApi,
  documentProcessingJobsUseCoreApi: mocks.documentProcessingJobsUseCoreApi,
  documentUploadReservationIssuanceUsesCoreApi:
    mocks.documentUploadReservationIssuanceUsesCoreApi,
  documentUploadReservationWritesUseCoreApi:
    mocks.documentUploadReservationWritesUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi:
    mocks.enqueueDocumentProcessingThroughCoreApi,
}))

vi.mock('@/lib/document-intake/deterministic-extractor', () => ({
  extractDeterministicDocument: mocks.extractDeterministicDocument,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const RESERVATION_ID = '55555555-5555-4555-8555-555555555555'
const TRACE_ID = '77777777-7777-4777-8777-777777777777'

type IntakeCommand = {
  storagePath: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  description: string | null
}

function documentTypeFor(
  fileName: string,
  mimeType: string
): 'dxf' | 'pdf' | 'image' | 'other' {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'dxf' || extension === 'dwg') return 'dxf'
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

function successfulIntake(command: IntakeCommand, created = true) {
  return {
    ok: true as const,
    status: created ? 201 : 200,
    data: {
      documentId: DOCUMENT_ID,
      tenantId: TENANT_ID,
      projectId: command.projectId,
      storagePath: command.storagePath,
      documentType: documentTypeFor(command.fileName, command.mimeType),
      status: 'created' as const,
      created,
    },
  }
}

function uploadRequest(
  overrides: Partial<{
    storagePath: string
    projectId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    description: string
  }> = {}
): NextRequest {
  const projectId = overrides.projectId ?? PROJECT_ID
  return new NextRequest('http://localhost/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storagePath:
        overrides.storagePath ?? `${TENANT_ID}/${projectId}/uploaded-notes.txt`,
      projectId,
      fileName: overrides.fileName ?? 'notes.txt',
      mimeType: overrides.mimeType ?? 'text/plain',
      sizeBytes: overrides.sizeBytes ?? 1_024,
      ...(overrides.description === undefined
        ? {}
        : { description: overrides.description }),
    }),
  })
}

function reservationRequest(): NextRequest {
  return new NextRequest('http://localhost/api/upload/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': TRACE_ID,
    },
    body: JSON.stringify({ reservationId: RESERVATION_ID }),
  })
}

describe('completed document upload Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'pm',
      email: 'pm@example.com',
      fullName: 'PM User',
    })
    mocks.can.mockReturnValue(true)
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(false)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(false)
    mocks.createDocumentThroughCoreApi.mockImplementation(
      async (command: IntakeCommand) => successfulIntake(command)
    )
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(false)
    mocks.extractDeterministicDocument.mockResolvedValue({
      status: 'extracted',
      detectedKind: 'pdf',
      sourceSha256: 'a'.repeat(64),
      extractedText: 'Mechanical schedule',
      extractedCharacters: 19,
      pages: 1,
      sheets: null,
      ocrConfidence: null,
      warnings: [],
      message: 'PDF read locally.',
      cacheHit: false,
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('rejects unauthenticated and tenantless callers before Core or derived work', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    expect((await POST(reservationRequest())).status).toBe(401)

    mocks.getUserProfile.mockResolvedValueOnce({
      user: { id: USER_ID },
      tenantId: null,
      role: 'pm',
    })
    expect((await POST(reservationRequest())).status).toBe(403)

    expect(
      mocks.completeDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
  })

  it('rejects a role without document mutation capability before Core work', async () => {
    mocks.can.mockReturnValue(false)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
  })

  it('delegates project ownership to Core and does not process a denied upload', async () => {
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Project was not found.',
    })

    const response = await POST(
      uploadRequest({ fileName: 'drawing.dwg', mimeType: 'application/acad' })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Project was not found.',
    })
    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledTimes(1)
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).not.toHaveBeenCalled()
  })

  it('records every non-extractor upload through Core before returning the legacy response', async () => {
    const storagePath = `${TENANT_ID}/${PROJECT_ID}/uploaded-notes.txt`

    const response = await POST(uploadRequest({ storagePath }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: DOCUMENT_ID,
      storagePath,
      documentType: 'other',
      cadFormat: null,
      cadParseQueued: false,
    })
    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledWith(
      {
        storagePath,
        projectId: PROJECT_ID,
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 1_024,
        description: null,
      },
      expect.stringMatching(/^upload-[a-f0-9]{64}$/)
    )
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
  })

  it('completes a reservation from canonical Core metadata without legacy intake', async () => {
    const canonicalPath = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-scope.pdf`
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: canonicalPath,
        fileName: 'scope.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_024,
        description: null,
        documentType: 'pdf',
        state: 'completed',
        created: true,
        replayed: false,
      },
    })

    const response = await POST(reservationRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      storagePath: canonicalPath,
      documentType: 'pdf',
      cadFormat: null,
    })
    expect(
      mocks.completeDocumentUploadReservationThroughCoreApi
    ).toHaveBeenCalledWith(
      RESERVATION_ID,
      TRACE_ID
    )
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      storagePath: canonicalPath,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  })

  it('recovers downstream processing after a replayed reservation completion', async () => {
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-scope.pdf`,
        fileName: 'scope.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_024,
        description: null,
        documentType: 'pdf',
        state: 'completed',
        created: false,
        replayed: true,
      },
    })

    const response = await POST(reservationRequest())

    expect(response.status).toBe(200)
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-scope.pdf`,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  })

  it('rejects legacy completion for a tenant selected for reservation issuance', async () => {
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'reservationId is required for this tenant.',
    })
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(
      mocks.completeDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('fails closed when reservation lifecycle writes are not selected', async () => {
    const response = await POST(reservationRequest())

    expect(response.status).toBe(503)
    expect(
      mocks.completeDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
  })

  it('does not fall back or process downstream after selected Core completion fails', async () => {
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. The upload remains pending.',
    })

    const response = await POST(reservationRequest())

    expect(response.status).toBe(503)
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).not.toHaveBeenCalled()
  })

  it('keeps legacy completion available while issuance is off and lifecycle drains', async () => {
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(false)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(200)
    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledOnce()
    expect(
      mocks.completeDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('rejects a cross-tenant Core completion result before derived processing', async () => {
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        documentId: DOCUMENT_ID,
        tenantId: '66666666-6666-4666-8666-666666666666',
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-scope.pdf`,
        fileName: 'scope.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_024,
        description: null,
        documentType: 'pdf',
        state: 'completed',
        created: true,
        replayed: false,
      },
    })

    const response = await POST(reservationRequest())

    expect(response.status).toBe(503)
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
  })

  it('rejects a same-project Core path substituted from another reservation', async () => {
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath:
          `${TENANT_ID}/${PROJECT_ID}/66666666-6666-4666-8666-666666666666-scope.pdf`,
        fileName: 'scope.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_024,
        description: null,
        documentType: 'pdf',
        state: 'completed',
        created: true,
        replayed: false,
      },
    })

    const response = await POST(reservationRequest())

    expect(response.status).toBe(503)
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).not.toHaveBeenCalled()
  })

  it('recovers deterministic processing when legacy Core intake replays', async () => {
    mocks.createDocumentThroughCoreApi.mockImplementation(
      async (command: IntakeCommand) => successfulIntake(command, false)
    )

    const response = await POST(
      uploadRequest({ fileName: 'scope.pdf', mimeType: 'application/pdf' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/uploaded-notes.txt`,
      documentType: 'pdf',
      cadFormat: null,
      cadParseQueued: false,
      cadResult: { status: 'extracted', detectedFormat: 'pdf' },
    })
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.extractDeterministicDocument).toHaveBeenCalledOnce()
  })

  it('delegates binary DWG processing to Core after Core records the document', async () => {
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(true)
    mocks.enqueueDocumentProcessingThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        jobId: '55555555-5555-4555-8555-555555555555',
        status: 'queued',
        documentId: DOCUMENT_ID,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    })

    const response = await POST(
      uploadRequest({ fileName: 'drawing.dwg', mimeType: 'application/acad' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      documentType: 'dxf',
      cadParseQueued: true,
      cadResult: {
        status: 'queued',
        scopeItemsCreated: 0,
        detectedFormat: 'dwg',
        processingJobId: '55555555-5555-4555-8555-555555555555',
      },
    })
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).toHaveBeenCalledWith(
      DOCUMENT_ID,
      {
        mode: 'cad',
        requestedFormat: 'dwg',
        createDraftBom: false,
      },
      `cad-processing-${DOCUMENT_ID}`
    )
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
  })

  it('commits parsed DXF evidence through Core without a tenant selector', async () => {
    const storagePath = `${TENANT_ID}/${PROJECT_ID}/drawing.dxf`
    const workerResponse = {
      document_id: DOCUMENT_ID,
      scope_items: [
        {
          code: null,
          description: 'Fan Coil Unit',
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
    }
    mocks.parseCadEvidence.mockResolvedValue({
      status: 'extracted',
      scopeItemsCreated: 0,
      warnings: [],
      layerCount: 1,
      entityCount: 2,
      detectedFormat: 'dxf',
      dwgVersion: null,
      extensionMismatch: false,
      bom: null,
      message: 'Parsed 1 scope item.',
      workerResponse,
    })
    mocks.commitCadEvidenceThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        documentId: DOCUMENT_ID,
        projectId: PROJECT_ID,
        tenantId: TENANT_ID,
        scopeItemsCreated: 1,
        sourceFormat: 'dxf',
        status: 'committed',
      },
    })

    const response = await POST(
      uploadRequest({
        storagePath,
        fileName: 'drawing.dxf',
        mimeType: 'application/dxf',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      cadParseQueued: false,
      cadResult: {
        status: 'extracted',
        scopeItemsCreated: 1,
        detectedFormat: 'dxf',
        bomId: null,
      },
    })
    expect(mocks.parseCadEvidence).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath,
      fileName: 'drawing.dxf',
      actorId: USER_ID,
    })
    expect(mocks.commitCadEvidenceThroughCoreApi).toHaveBeenCalledWith(
      DOCUMENT_ID,
      { projectId: PROJECT_ID, workerResponse },
      `cad-evidence-${DOCUMENT_ID}`,
      TENANT_ID
    )
  })

  it('does not fall back after a Core CAD failure', async () => {
    const workerResponse = {
      document_id: DOCUMENT_ID,
      scope_items: [],
      count: 0,
      warnings: [],
      parsed_format: 'dxf' as const,
      source_format: 'dxf' as const,
    }
    mocks.parseCadEvidence.mockResolvedValue({
      status: 'extracted',
      scopeItemsCreated: 0,
      warnings: [],
      layerCount: 0,
      entityCount: 0,
      detectedFormat: 'dxf',
      dwgVersion: null,
      extensionMismatch: false,
      bom: null,
      message: 'Parsed 0 scope items.',
      workerResponse,
    })
    mocks.commitCadEvidenceThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No CAD evidence was committed.',
    })

    const response = await POST(
      uploadRequest({ fileName: 'drawing.dxf', mimeType: 'application/dxf' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      cadParseWarning:
        'ERP Core API is unavailable. No CAD evidence was committed.',
      cadResult: { status: 'processing-unavailable', scopeItemsCreated: 0 },
    })
  })

  it('does not run a Next-side worker when Core document recording fails', async () => {
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No document was recorded.',
    })

    const response = await POST(
      uploadRequest({ fileName: 'drawing.dwg', mimeType: 'application/acad' })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'ERP Core API is unavailable. No document was recorded.',
    })
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).not.toHaveBeenCalled()
  })

  it('reads a supported source document locally without provider quota or BOM writes', async () => {
    mocks.extractDeterministicDocument.mockResolvedValue({
      status: 'extracted',
      sourceSha256: 'a'.repeat(64),
      extractedText: 'Mechanical schedule',
      extractedCharacters: 19,
      pages: 1,
      sheets: null,
      ocrConfidence: null,
      warnings: ['No model or BOM mutation was invoked.'],
      detectedKind: 'pdf',
      message: 'PDF read locally.',
      cacheHit: true,
    })

    const response = await POST(
      uploadRequest({ fileName: 'scope.pdf', mimeType: 'application/pdf' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      cadParseQueued: false,
      cadResult: {
        status: 'extracted',
        detectedFormat: 'pdf',
        scopeItemsCreated: 0,
        bomId: null,
        bomTcvCents: 0,
        extractedCharacters: 19,
        extractionPages: 1,
        extractionCacheHit: true,
      },
    })
    expect(mocks.extractDeterministicDocument).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/uploaded-notes.txt`,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  })
})
