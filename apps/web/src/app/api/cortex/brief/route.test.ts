import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexOperationalBrief: vi.fn(),
  cortexNodeTypeScope: vi.fn(),
  cortexEntityDefinition: vi.fn(),
  cortexHref: vi.fn(),
  cortexBriefReadsUseCoreApi: vi.fn(),
  getCortexBriefThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  CORTEX_BRIEF_DEFAULT_LIMIT: 12,
  CORTEX_BRIEF_MAX_LIMIT: 24,
  getCortexOperationalBrief: mocks.getCortexOperationalBrief,
}))

vi.mock('@/lib/cortex/rbac', () => ({
  cortexNodeTypeScope: mocks.cortexNodeTypeScope,
}))

vi.mock('@/lib/cortex/entity-registry', () => ({
  cortexEntityDefinition: mocks.cortexEntityDefinition,
  cortexHref: mocks.cortexHref,
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexBriefReadsUseCoreApi: mocks.cortexBriefReadsUseCoreApi,
  getCortexBriefThroughCoreApi: mocks.getCortexBriefThroughCoreApi,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

function request(query = '') {
  return GET(new NextRequest(`http://localhost/api/cortex/brief${query}`))
}

describe('Cortex operational brief boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
    })
    mocks.cortexNodeTypeScope.mockReturnValue(['invoice', 'journal_entry'])
    mocks.cortexEntityDefinition.mockReturnValue({
      label: 'Invoice',
      refTables: ['invoices'],
    })
    mocks.cortexHref.mockReturnValue('/invoices/' + REF_ID)
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(false)
    mocks.getCortexOperationalBrief.mockResolvedValue({
      generatedAt: new Date('2026-08-04T00:00:00.000Z'),
      stats: {
        nodes: 4,
        edges: 3,
        provenance: 4,
        byType: [{ nodeType: 'invoice', count: 4 }],
      },
      freshness: { fresh: 1, stale: 1, unknown: 0 },
      items: [
        {
          nodeId: NODE_ID,
          nodeType: 'invoice',
          refTable: 'invoices',
          refId: REF_ID,
          title: '  Invoice 1042  ',
          summary: 'Concrete Tower progress billing',
          freshness: 'fresh',
          recordedAt: new Date('2026-08-03T23:00:00.000Z'),
          projectId: PROJECT_ID,
        },
        {
          nodeId: '55555555-5555-4555-8555-555555555555',
          nodeType: 'invoice',
          refTable: 'secret_table',
          refId: REF_ID,
          title: 'Should not leak',
          summary: null,
          freshness: 'stale',
          recordedAt: new Date('2026-08-03T22:00:00.000Z'),
          projectId: null,
        },
      ],
    })
  })

  it('requires an authenticated profile', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('rejects invalid limits before database access', async () => {
    const response = await request('?limit=25')

    expect(response.status).toBe(400)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
  })

  it('passes the session tenant, role scope, and bounded limit', async () => {
    const response = await request('?limit=6')

    expect(response.status).toBe(200)
    expect(mocks.getCortexOperationalBrief).toHaveBeenCalledWith(
      TENANT_ID,
      ['invoice', 'journal_entry'],
      6
    )
  })

  it('returns safe deep links and omits unregistered graph sources', async () => {
    const response = await request()
    const body = await response.json()

    expect(body).toEqual({
      generatedAt: '2026-08-04T00:00:00.000Z',
      stats: {
        nodes: 4,
        edges: 3,
        provenance: 4,
        byType: [{ nodeType: 'invoice', count: 4 }],
      },
      freshness: { fresh: 1, stale: 1, unknown: 0 },
      items: [
        {
          id: NODE_ID,
          nodeType: 'invoice',
          label: 'Invoice',
          title: 'Invoice 1042',
          summary: 'Concrete Tower progress billing',
          href: '/invoices/' + REF_ID,
          refTable: 'invoices',
          refId: REF_ID,
          freshness: 'fresh',
          recordedAt: '2026-08-03T23:00:00.000Z',
          source: 'cortex',
        },
      ],
    })
    expect(mocks.cortexHref).toHaveBeenCalledWith({
      type: 'invoice',
      refId: REF_ID,
      projectId: PROJECT_ID,
    })
  })

  it('uses the closed Core adapter for an explicit tenant canary', async () => {
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexBriefThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: {
          nodes: 1,
          edges: 0,
          provenance: 1,
          byType: [{ nodeType: 'invoice', count: 1 }],
        },
        freshness: { fresh: 1, stale: 0, unknown: 0 },
        items: [
          {
            id: NODE_ID,
            nodeType: 'invoice',
            title: 'Invoice 1042',
            summary: null,
            refTable: 'invoices',
            refId: REF_ID,
            projectId: PROJECT_ID,
            freshness: 'fresh',
            recordedAt: '2026-08-08T23:00:00.000Z',
            source: 'cortex',
          },
        ],
      },
    })

    const response = await request('?limit=6')
    await expect(response.json()).resolves.toMatchObject({
      generatedAt: '2026-08-09T00:00:00.000Z',
      items: [
        expect.objectContaining({ id: NODE_ID, href: '/invoices/' + REF_ID }),
      ],
    })
    expect(mocks.getCortexBriefThroughCoreApi).toHaveBeenCalledWith(6)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
  })

  it('does not fall back to direct reads when Core is enabled but unavailable', async () => {
    mocks.cortexBriefReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexBriefThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Cortex brief service is unavailable.',
    })

    const response = await request()

    expect(response.status).toBe(503)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
  })
})
