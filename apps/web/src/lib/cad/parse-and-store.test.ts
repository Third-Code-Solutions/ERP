import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  from: vi.fn(),
  detectCadFormat: vi.fn(),
  fileExtensionOf: vi.fn(),
  extractFromDxfText: vi.fn(),
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    storage: { from: mocks.from },
  })),
}))

vi.mock('./dxf-extractor', () => ({
  extractFromDxfText: mocks.extractFromDxfText,
}))

vi.mock('./format-detect', () => ({
  detectCadFormat: mocks.detectCadFormat,
  fileExtensionOf: mocks.fileExtensionOf,
}))

import { parseCadEvidence } from './parse-and-store'

const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const validItem = {
  code: null,
  description: 'Fan Coil Unit',
  unit: 'unit',
  quantity: 2,
  unit_cost_cents: 0,
  notes: null,
}

describe('CAD evidence parser boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ download: mocks.download })
    mocks.download.mockResolvedValue({
      data: new Blob(['dxf']),
      error: null,
    })
    mocks.fileExtensionOf.mockReturnValue('dxf')
    mocks.detectCadFormat.mockReturnValue({
      format: 'dxf',
      mismatch: false,
      dwgVersion: null,
    })
    mocks.extractFromDxfText.mockReturnValue({
      items: [validItem],
      warnings: [],
      layerCount: 1,
      entityCount: 2,
    })
  })

  it('returns strict worker evidence without touching the database', async () => {
    const result = await parseCadEvidence({
      tenantId: '22222222-2222-4222-8222-222222222222',
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: 'tenant/project/drawing.dxf',
      fileName: 'drawing.dxf',
    })

    expect(result.status).toBe('extracted')
    expect(result.scopeItemsCreated).toBe(0)
    expect(result.bom).toBeNull()
    expect(result.workerResponse).toMatchObject({
      document_id: DOCUMENT_ID,
      count: 1,
      scope_items: [validItem],
      parsed_format: 'dxf',
      source_format: 'dxf',
    })
  })

  it('fails evidence validation before any persistence boundary', async () => {
    mocks.extractFromDxfText.mockReturnValue({
      items: [{ ...validItem, quantity: -1 }],
      warnings: [],
      layerCount: 1,
      entityCount: 1,
    })

    const result = await parseCadEvidence({
      tenantId: '22222222-2222-4222-8222-222222222222',
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: 'tenant/project/drawing.dxf',
      fileName: 'drawing.dxf',
    })

    expect(result.status).toBe('parse-failed')
    expect(result.workerResponse).toBeNull()
    expect(result.warnings[0]).toContain('CAD evidence validation failed')
  })

  it('rejects fractional evidence rather than rounding it before a persistence boundary', async () => {
    mocks.extractFromDxfText.mockReturnValue({
      items: [{ ...validItem, quantity: 1.5 }],
      warnings: [],
      layerCount: 1,
      entityCount: 1,
    })

    const result = await parseCadEvidence({
      tenantId: '22222222-2222-4222-8222-222222222222',
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: 'tenant/project/drawing.dxf',
      fileName: 'drawing.dxf',
    })

    expect(result.status).toBe('parse-failed')
    expect(result.workerResponse).toBeNull()
    expect(result.warnings[0]).toContain('CAD evidence validation failed')
  })

  it('accepts provider-neutral Storage without constructing a Supabase client', async () => {
    const storage = {
      download: vi.fn().mockResolvedValue({
        data: new Blob(['dxf']),
        error: null,
      }),
    }

    const result = await parseCadEvidence(
      {
        tenantId: '22222222-2222-4222-8222-222222222222',
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        storagePath: 'tenant/project/drawing.dxf',
        fileName: 'drawing.dxf',
      },
      storage
    )

    expect(result.status).toBe('extracted')
    expect(storage.download).toHaveBeenCalledWith('tenant/project/drawing.dxf')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
