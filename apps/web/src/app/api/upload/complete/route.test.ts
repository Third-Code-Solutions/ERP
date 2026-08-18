import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  createDocumentThroughCoreApi: vi.fn(),
  parseCadEvidence: vi.fn(),
  commitCadEvidenceThroughCoreApi: vi.fn(),
  documentProcessingJobsUseCoreApi: vi.fn(),
  enqueueDocumentProcessingThroughCoreApi: vi.fn(),
  extractScopeFromVisual: vi.fn(),
  consumeProviderQuota: vi.fn(),
  providerQuotaBlockedResponse: vi.fn(),
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
  createDocumentThroughCoreApi: mocks.createDocumentThroughCoreApi,
  documentProcessingJobsUseCoreApi: mocks.documentProcessingJobsUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi:
    mocks.enqueueDocumentProcessingThroughCoreApi,
}))

vi.mock('@/lib/vision/extract-from-visual', () => ({
  extractScopeFromVisual: mocks.extractScopeFromVisual,
}))

vi.mock('@/lib/provider-quota', () => ({
  consumeProviderQuota: mocks.consumeProviderQuota,
  providerQuotaBlockedResponse: mocks.providerQuotaBlockedResponse,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

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
    mocks.createDocumentThroughCoreApi.mockImplementation(
      async (command: IntakeCommand) => successfulIntake(command)
    )
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(false)
    mocks.consumeProviderQuota.mockResolvedValue({ ok: true, skipped: true })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('rejects a role without document mutation capability before Core work', async () => {
    mocks.can.mockReturnValue(false)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
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
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
  })

  it('does not rerun derived processing when Core replays an upload command', async () => {
    mocks.createDocumentThroughCoreApi.mockImplementation(
      async (command: IntakeCommand) => successfulIntake(command, false)
    )

    const response = await POST(
      uploadRequest({ fileName: 'drawing.dxf', mimeType: 'application/dxf' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: DOCUMENT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/uploaded-notes.txt`,
      documentType: 'dxf',
      cadFormat: 'dxf',
      cadParseQueued: false,
    })
    expect(mocks.parseCadEvidence).not.toHaveBeenCalled()
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).not.toHaveBeenCalled()
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

  it('rejects selected shared vision quota before recording a source document', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    mocks.consumeProviderQuota.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'Provider quota exceeded',
      retryAfterSeconds: 12,
      limit: 4,
      scope: 'tenant-user',
    })
    mocks.providerQuotaBlockedResponse.mockReturnValue(
      new Response('Provider quota exceeded', { status: 429 })
    )

    const response = await POST(
      uploadRequest({ fileName: 'scope.pdf', mimeType: 'application/pdf' })
    )

    expect(response.status).toBe(429)
    expect(mocks.consumeProviderQuota).toHaveBeenCalledWith(
      'provider-vision',
      TENANT_ID
    )
    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
  })

  it('returns a Core-created visual candidate as explicitly unpriced', async () => {
    mocks.extractScopeFromVisual.mockResolvedValue({
      status: 'extracted',
      scopeItemsCreated: 2,
      warnings: ['Attach a DUPA before approval.'],
      detectedKind: 'pdf',
      bom: {
        bomId: '55555555-5555-4555-8555-555555555555',
        totalCostCents: 0,
        totalTcvCents: 0,
        gpMarginBps: 0,
        ragMatches: 0,
        aiEstimateMatches: 0,
        unpriced: 2,
      },
      message: 'Created an unpriced candidate BOM.',
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
        scopeItemsCreated: 2,
        bomId: '55555555-5555-4555-8555-555555555555',
        bomTcvCents: 0,
        unpricedCandidateBom: true,
      },
    })
    expect(mocks.extractScopeFromVisual).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/uploaded-notes.txt`,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  })
})
