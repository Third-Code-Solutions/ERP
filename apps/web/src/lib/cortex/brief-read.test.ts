import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCortexOperationalBrief: vi.fn(),
  cortexBriefReadsUseCoreApi: vi.fn(),
  getCortexBriefThroughCoreApi: vi.fn(),
  cortexNodeTypeScope: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexOperationalBrief: mocks.getCortexOperationalBrief,
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexBriefReadsUseCoreApi: mocks.cortexBriefReadsUseCoreApi,
  getCortexBriefThroughCoreApi: mocks.getCortexBriefThroughCoreApi,
}))

vi.mock('./rbac', () => ({
  cortexNodeTypeScope: mocks.cortexNodeTypeScope,
}))

import { readCortexBrief } from './brief-read'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'
const GENERATED_AT = '2026-08-09T00:00:00.000Z'

const databaseBrief = {
  generatedAt: new Date(GENERATED_AT),
  stats: {
    nodes: 1,
    edges: 0,
    provenance: 1,
    byType: [{ nodeType: 'invoice', count: 1 }],
  },
  freshness: { fresh: 1, stale: 0, unknown: 0 },
  items: [
    {
      nodeId: NODE_ID,
      nodeType: 'invoice',
      refTable: 'invoices',
      refId: REF_ID,
      title: 'Invoice 1001',
      summary: null,
      freshness: 'fresh',
      recordedAt: new Date(GENERATED_AT),
      projectId: null,
    },
  ],
}

const coreBrief = {
  generatedAt: GENERATED_AT,
  stats: databaseBrief.stats,
  freshness: databaseBrief.freshness,
  items: [
    {
      id: NODE_ID,
      nodeType: 'invoice',
      refTable: 'invoices',
      refId: REF_ID,
      title: 'Invoice 1001',
      summary: null,
      freshness: 'fresh',
      recordedAt: GENERATED_AT,
      projectId: null,
      source: 'cortex',
    },
  ],
}

describe('readCortexBrief', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(false)
    mocks.cortexNodeTypeScope.mockReturnValue(['invoice'])
    mocks.getCortexOperationalBrief.mockResolvedValue(databaseBrief)
  })

  it('keeps the unselected dashboard on the tenant and role-scoped database path', async () => {
    await expect(
      readCortexBrief({ tenantId: TENANT_ID, role: 'admin', limit: 8 })
    ).resolves.toMatchObject({ ok: true, source: 'database', brief: databaseBrief })

    expect(mocks.cortexBriefReadsUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.cortexNodeTypeScope).toHaveBeenCalledWith('admin')
    expect(mocks.getCortexOperationalBrief).toHaveBeenCalledWith(
      TENANT_ID,
      ['invoice'],
      8
    )
    expect(mocks.getCortexBriefThroughCoreApi).not.toHaveBeenCalled()
  })

  it('normalizes the selected Core projection and never reads the database', async () => {
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexBriefThroughCoreApi.mockResolvedValue({
      ok: true,
      data: coreBrief,
    })

    await expect(
      readCortexBrief({ tenantId: TENANT_ID, role: 'admin', limit: 8 })
    ).resolves.toMatchObject({
      ok: true,
      source: 'core',
      brief: {
        generatedAt: new Date(GENERATED_AT),
        items: [{ nodeId: NODE_ID, recordedAt: new Date(GENERATED_AT) }],
      },
    })

    expect(mocks.getCortexBriefThroughCoreApi).toHaveBeenCalledWith(8)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
    expect(mocks.cortexNodeTypeScope).not.toHaveBeenCalled()
  })

  it('proves normalized Core output is structurally equal to the legacy fixture', async () => {
    const legacy = await readCortexBrief({
      tenantId: TENANT_ID,
      role: 'admin',
      limit: 8,
    })
    expect(legacy.ok).toBe(true)
    if (!legacy.ok) return

    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexBriefThroughCoreApi.mockResolvedValue({
      ok: true,
      data: coreBrief,
    })

    const core = await readCortexBrief({
      tenantId: TENANT_ID,
      role: 'admin',
      limit: 8,
    })
    expect(core.ok).toBe(true)
    if (!core.ok) return

    expect(core.brief).toEqual(legacy.brief)
  })

  it('fails closed for a selected tenant when Core is unavailable', async () => {
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexBriefThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Core unavailable',
    })

    await expect(
      readCortexBrief({ tenantId: TENANT_ID, role: 'admin', limit: 8 })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 503,
      error: 'Core unavailable',
    })

    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
  })
})
