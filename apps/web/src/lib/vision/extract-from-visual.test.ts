import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  download: vi.fn(),
  createResponse: vi.fn(),
  executeTakeoffImportThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@/lib/erp-core-client', () => ({
  executeTakeoffImportThroughCoreApi:
    mocks.executeTakeoffImportThroughCoreApi,
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mocks.createResponse }
  },
}))

import { extractScopeFromVisual } from './extract-from-visual'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '44444444-4444-4444-8444-444444444444'
const SHA256 = 'a'.repeat(64)

describe('visual scope extraction Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({ download: mocks.download }),
      },
    })
    mocks.download.mockResolvedValue({
      data: new Blob(['evidence'], { type: 'application/pdf' }),
      error: null,
    })
    mocks.createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        items: [
          {
            code: 'A-001',
            description: 'Suspended ceiling',
            unit: 'sqm',
            quantity: 12,
            category: 'Architectural / Finishes',
            notes: 'Sheet A-2',
          },
        ],
      }),
    })
    mocks.executeTakeoffImportThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        mode: 'commit',
        tenantId: TENANT_ID,
        importId: '55555555-5555-4555-8555-555555555555',
        source: 'ai-document',
        sourceKey: SHA256,
        linesUpserted: 1,
        unresolvedCount: 2,
        bomId: BOM_ID,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends unpriced, document-provenanced candidates to Core only', async () => {
    const result = await extractScopeFromVisual({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/scope.pdf`,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      scopeItemsCreated: 1,
      bom: {
        bomId: BOM_ID,
        totalCostCents: 0,
        totalTcvCents: 0,
        unpriced: 1,
      },
    })
    expect(result.warnings).toContain(
      'AI-derived scope candidates are unpriced. Resolve 2 review queue items and attach a DUPA before approval.'
    )

    const [command, expectedTenantId] =
      mocks.executeTakeoffImportThroughCoreApi.mock.calls[0] ?? []
    expect(expectedTenantId).toBe(TENANT_ID)
    expect(command).toMatchObject({
      mode: 'commit',
      target: 'ai_document',
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      source: 'ai-document',
      sourceModel: 'gpt-4o-mini',
      rows: [
        {
          sourceRowKey: 'vision-A-001-1',
          description: 'Suspended ceiling',
          quantity: 12,
          unit: 'sqm',
          division: null,
          location: null,
          itemNo: 'A-001',
        },
      ],
    })
    expect(command.rows[0]).not.toHaveProperty('unit_cost_php')
    expect(command.rows[0]).not.toHaveProperty('estimated_unit_cost_php')
    expect(command.rows[0]).not.toHaveProperty('unitCostCents')

    const request = mocks.createResponse.mock.calls[0]?.[0]
    expect(request.text.format.schema.properties.items.items.properties).not.toHaveProperty(
      'unit_cost_php'
    )
    expect(request.text.format.schema.properties.items.items.properties).not.toHaveProperty(
      'estimated_unit_cost_php'
    )
  })

  it('does not write a fallback when Core rejects the evidence', async () => {
    mocks.executeTakeoffImportThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No takeoff data was committed.',
    })

    const result = await extractScopeFromVisual({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/scope.pdf`,
      fileName: 'scope.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    expect(result).toMatchObject({
      status: 'core-unavailable',
      scopeItemsCreated: 0,
      bom: null,
    })
    expect(result.warnings).toContain(
      'ERP Core API is unavailable. No takeoff data was committed.'
    )
    expect(mocks.executeTakeoffImportThroughCoreApi).toHaveBeenCalledTimes(1)
  })
})
