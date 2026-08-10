import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  getProject: vi.fn(),
  parseAndStoreCad: vi.fn(),
  parseCadEvidence: vi.fn(),
  cadEvidenceCommitWritesUseCoreApi: vi.fn(),
  commitCadEvidenceThroughCoreApi: vi.fn(),
  documentProcessingJobsUseCoreApi: vi.fn(),
  enqueueDocumentProcessingThroughCoreApi: vi.fn(),
  extractScopeFromVisual: vi.fn(),
  documentIntakeCanarySelectedForUpload: vi.fn(),
  completeDocumentUploadThroughCoreCanary: vi.fn(),
  send: vi.fn(),
  transaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/project-queries', () => ({
  getProject: mocks.getProject,
}))

vi.mock('@/lib/cad/parse-and-store', () => ({
  parseAndStoreCad: mocks.parseAndStoreCad,
  parseCadEvidence: mocks.parseCadEvidence,
}))

vi.mock('@/lib/erp-core-client', () => ({
  cadEvidenceCommitWritesUseCoreApi: mocks.cadEvidenceCommitWritesUseCoreApi,
  commitCadEvidenceThroughCoreApi: mocks.commitCadEvidenceThroughCoreApi,
  documentIntakeCanarySelectedForUpload:
    mocks.documentIntakeCanarySelectedForUpload,
  completeDocumentUploadThroughCoreCanary:
    mocks.completeDocumentUploadThroughCoreCanary,
  documentProcessingJobsUseCoreApi: mocks.documentProcessingJobsUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi:
    mocks.enqueueDocumentProcessingThroughCoreApi,
}))

vi.mock('@/lib/vision/extract-from-visual', () => ({
  extractScopeFromVisual: mocks.extractScopeFromVisual,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: {
    send: mocks.send,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('completed document upload Project access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'pm' }])
    mocks.getProject.mockResolvedValue(null)
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ returning: mocks.returning })
    mocks.transaction.mockImplementation(
      async (callback: (tx: { insert: typeof mocks.insert }) => unknown) =>
        callback({ insert: mocks.insert })
    )
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    mocks.documentIntakeCanarySelectedForUpload.mockReturnValue(false)
    mocks.cadEvidenceCommitWritesUseCoreApi.mockReturnValue(false)
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(false)
  })

  it('rejects a role without document mutation capability before request work', async () => {
    mocks.can.mockReturnValue(false)
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('rejects an absent or cross-tenant Project before recording or processing', async () => {
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Project not found',
    })
    expect(mocks.getProject).toHaveBeenCalledWith(
      TENANT_ID,
      OTHER_PROJECT_ID
    )
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('preserves document recording for a same-tenant Project', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    const storagePath =
      `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: documentId,
      storagePath,
      documentType: 'other',
      cadParseQueued: false,
    })
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mocks.insert }),
      {
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'document',
        entityId: documentId,
        action: 'create',
        diff: {
          project_id: OTHER_PROJECT_ID,
          document_type: 'other',
          size_bytes: 1_024,
        },
      }
    )
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
  })

  it('delegates binary DWG processing to Nest when the tenant canary is enabled', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(true)
    mocks.enqueueDocumentProcessingThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        jobId: '55555555-5555-4555-8555-555555555555',
        status: 'queued',
        documentId,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: documentId,
      cadParseQueued: true,
      cadResult: {
        status: 'queued',
        scopeItemsCreated: 0,
        detectedFormat: 'dwg',
        processingJobId: '55555555-5555-4555-8555-555555555555',
      },
    })
    expect(mocks.enqueueDocumentProcessingThroughCoreApi).toHaveBeenCalledWith(
      documentId,
      {
        mode: 'cad',
        requestedFormat: 'dwg',
        createDraftBom: false,
      },
      `cad-processing-${documentId}`
    )
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('commits parsed DXF evidence through Core without the compatibility writer', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    const storagePath = `${TENANT_ID}/${OTHER_PROJECT_ID}/drawing.dxf`
    const workerResponse = {
      document_id: documentId,
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
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    mocks.cadEvidenceCommitWritesUseCoreApi.mockReturnValue(true)
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
        documentId,
        projectId: OTHER_PROJECT_ID,
        tenantId: TENANT_ID,
        scopeItemsCreated: 1,
        sourceFormat: 'dxf',
        status: 'committed',
      },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dxf',
          mimeType: 'application/dxf',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: documentId,
      cadParseQueued: true,
      cadResult: {
        status: 'extracted',
        scopeItemsCreated: 1,
        detectedFormat: 'dxf',
        bomId: null,
      },
    })
    expect(mocks.parseCadEvidence).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: OTHER_PROJECT_ID,
      documentId,
      storagePath,
      fileName: 'drawing.dxf',
      actorId: USER_ID,
    })
    expect(mocks.commitCadEvidenceThroughCoreApi).toHaveBeenCalledWith(
      documentId,
      { projectId: OTHER_PROJECT_ID, workerResponse },
      `cad-evidence-${documentId}`,
      TENANT_ID
    )
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
  })

  it('does not fall back to the compatibility writer after a selected Core failure', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    const workerResponse = {
      document_id: documentId,
      scope_items: [],
      count: 0,
      warnings: [],
      parsed_format: 'dxf' as const,
      source_format: 'dxf' as const,
    }
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    mocks.cadEvidenceCommitWritesUseCoreApi.mockReturnValue(true)
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
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/drawing.dxf`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dxf',
          mimeType: 'application/dxf',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      cadParseWarning:
        'ERP Core API is unavailable. No CAD evidence was committed.',
      cadResult: { status: 'processing-unavailable', scopeItemsCreated: 0 },
    })
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
  })

  it('delegates a non-extractor upload to Core before any legacy write', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    const storagePath = `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.documentIntakeCanarySelectedForUpload.mockReturnValue(true)
    mocks.completeDocumentUploadThroughCoreCanary.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        id: documentId,
        storagePath,
        documentType: 'other',
        cadFormat: null,
        cadParseQueued: false,
      },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: documentId,
      storagePath,
      documentType: 'other',
      cadFormat: null,
      cadParseQueued: false,
    })
    expect(mocks.completeDocumentUploadThroughCoreCanary).toHaveBeenCalledWith(
      {
        storagePath,
        projectId: OTHER_PROJECT_ID,
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 1_024,
        description: null,
      },
      TENANT_ID,
      expect.stringMatching(/^upload-[a-f0-9]{64}$/)
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
  })

  it('returns Core canary failure without falling back to a legacy write', async () => {
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.documentIntakeCanarySelectedForUpload.mockReturnValue(true)
    mocks.completeDocumentUploadThroughCoreCanary.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No document was recorded.',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'ERP Core API is unavailable. No document was recorded.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
  })

  it('fails closed without falling back to a Next-side scope write when core rejects the canary', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    mocks.documentProcessingJobsUseCoreApi.mockReturnValue(true)
    mocks.enqueueDocumentProcessingThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No document processing job was created.',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: documentId,
      cadParseQueued: false,
      cadParseWarning:
        'ERP Core API is unavailable. No document processing job was created.',
      cadResult: {
        status: 'processing-unavailable',
        scopeItemsCreated: 0,
      },
    })
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('fails closed before extraction when document audit cannot commit', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([
      { id: '44444444-4444-4444-8444-444444444444' },
    ])
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to record document',
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})
