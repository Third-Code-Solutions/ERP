import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cadEvidenceCommitWritesUseCoreApi,
  commitCadEvidenceThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'

const COMMAND = {
  projectId: PROJECT_ID,
  workerResponse: {
    document_id: DOCUMENT_ID,
    scope_items: [
      {
        code: 'CONC-01',
        description: 'Ready-mix concrete',
        unit: 'm3',
        quantity: 2,
        unit_cost_cents: 12_500,
        notes: null,
      },
    ],
    count: 1,
    warnings: [],
    parsed_format: 'dxf' as const,
    source_format: 'dxf' as const,
  },
}

const RESULT = {
  documentId: DOCUMENT_ID,
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  scopeItemsCreated: 1,
  sourceFormat: 'dxf' as const,
  status: 'committed' as const,
}

describe('CAD evidence Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-session-token' } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('selects only an exact allowlisted tenant', () => {
    expect(cadEvidenceCommitWritesUseCoreApi(TENANT_ID)).toBe(false)

    vi.stubEnv('ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API_TENANT_IDS', TENANT_ID)
    expect(cadEvidenceCommitWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(cadEvidenceCommitWritesUseCoreApi('not-a-uuid')).toBe(false)

    vi.stubEnv('ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(cadEvidenceCommitWritesUseCoreApi(TENANT_ID)).toBe(false)
  })

  it('sends an authenticated idempotent command and validates Core result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      commitCadEvidenceThroughCoreApi(DOCUMENT_ID, COMMAND, 'cad-evidence-1')
    ).resolves.toEqual({ ok: true, data: RESULT, status: 200 })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/documents/${DOCUMENT_ID}/cad-evidence`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(COMMAND),
        headers: expect.objectContaining({
          authorization: 'Bearer test-session-token',
          'Idempotency-Key': 'cad-evidence-1',
        }),
      })
    )
  })

  it('rejects malformed evidence before any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      commitCadEvidenceThroughCoreApi(
        DOCUMENT_ID,
        { ...COMMAND, workerResponse: { ...COMMAND.workerResponse, count: 2 } },
        'cad-evidence-invalid'
      )
    ).resolves.toEqual({
      ok: false,
      error: 'Invalid CAD evidence command.',
      status: 400,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns terminal Core outage without a fallback result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))
    )

    await expect(
      commitCadEvidenceThroughCoreApi(DOCUMENT_ID, COMMAND, 'cad-evidence-2')
    ).resolves.toEqual({
      ok: false,
      error: 'CAD evidence was not committed.',
      status: 503,
    })
  })
})
