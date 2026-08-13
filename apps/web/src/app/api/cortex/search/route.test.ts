import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  cortexNodeTypeScope: vi.fn(),
  cortexEntityDefinition: vi.fn(),
  cortexHref: vi.fn(),
  cortexSearchUseCoreApi: vi.fn(),
  searchCortexThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  searchCortexNodesByTerms: mocks.searchCortexNodesByTerms,
}))

vi.mock('@/lib/cortex/rbac', () => ({
  cortexNodeTypeScope: mocks.cortexNodeTypeScope,
}))

vi.mock('@/lib/cortex/entity-registry', () => ({
  cortexEntityDefinition: mocks.cortexEntityDefinition,
  cortexHref: mocks.cortexHref,
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexSearchUseCoreApi: mocks.cortexSearchUseCoreApi,
  searchCortexThroughCoreApi: mocks.searchCortexThroughCoreApi,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'

function request(query = '') {
  return GET(new NextRequest(`http://localhost/api/cortex/search${query}`))
}

describe('Cortex search authorization and retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
    })
    mocks.cortexNodeTypeScope.mockReturnValue(['invoice', 'journal_entry'])
    mocks.searchCortexNodesByTerms.mockResolvedValue([])
    mocks.cortexEntityDefinition.mockReturnValue({
      label: 'Invoice',
      refTables: ['invoices'],
    })
    mocks.cortexHref.mockReturnValue('/invoices/' + REF_ID)
    mocks.cortexSearchUseCoreApi.mockReturnValue(false)
  })

  it('requires an authenticated profile', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request('?q=concrete')

    expect(response.status).toBe(401)
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('rejects missing and unbounded queries before database access', async () => {
    const missing = await request()
    const tooLong = await request(`?q=${'x'.repeat(101)}`)

    expect(missing.status).toBe(400)
    expect(tooLong.status).toBe(400)
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })

  it('passes tenant and role scope to keyword retrieval', async () => {
    const response = await request('?q=%20Concrete%20Tower%20')

    expect(response.status).toBe(200)
    expect(mocks.searchCortexNodesByTerms).toHaveBeenCalledWith(
      TENANT_ID,
      ['concrete', 'tower'],
      20,
      ['invoice', 'journal_entry']
    )
  })

  it('returns source-cited, deep-linkable records and omits unregistered sources', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      {
        id: NODE_ID,
        node_type: 'invoice',
        ref_table: 'invoices',
        ref_id: REF_ID,
        title: '  Invoice 1042  ',
        summary: 'Concrete Tower progress billing',
        attributes: { project_id: '44444444-4444-4444-8444-444444444444' },
        freshness: 'fresh',
        scope: 'process',
        metric: 'cortex_provider_circuit_alert_enqueue_total',
        counters: { 'post_commit.enqueued': 1 },
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        node_type: 'invoice',
        ref_table: 'secret_table',
        ref_id: REF_ID,
        title: 'Should not leak',
        summary: null,
        attributes: null,
        freshness: 'fresh',
      },
    ])
    mocks.cortexEntityDefinition
      .mockReturnValueOnce({ label: 'Invoice', refTables: ['invoices'] })
      .mockReturnValueOnce({ label: 'Invoice', refTables: ['invoices'] })

    const response = await request('?q=concrete')
    const body = await response.json()

    expect(body.hits).toEqual([
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
        source: 'cortex',
      },
    ])
    expect(mocks.cortexHref).toHaveBeenCalledWith({
      type: 'invoice',
      refId: REF_ID,
      projectId: '44444444-4444-4444-8444-444444444444',
    })
  })

  it('does not query for punctuation-only terms', async () => {
    const response = await request('?q=%25_%25')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      hits: [],
      hint: 'Type a longer keyword.',
    })
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })

  it('uses the closed Core API adapter for an explicit tenant canary', async () => {
    mocks.cortexSearchUseCoreApi.mockReturnValue(true)
    mocks.searchCortexThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        hits: [
          {
            id: NODE_ID,
            nodeType: 'invoice',
            title: 'Invoice 1042',
            summary: 'Concrete Tower progress billing',
            refTable: 'invoices',
            refId: REF_ID,
            projectId: null,
            freshness: 'fresh',
            source: 'cortex',
          },
        ],
      },
    })

    const response = await request('?q=concrete')
    await expect(response.json()).resolves.toMatchObject({
      hits: [expect.objectContaining({ nodeType: 'invoice' })],
    })
    expect(mocks.searchCortexThroughCoreApi).toHaveBeenCalledWith(
      'concrete',
      20
    )
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })

  it('does not fall back to direct database reads when Core is enabled but unavailable', async () => {
    mocks.cortexSearchUseCoreApi.mockReturnValue(true)
    mocks.searchCortexThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Cortex search service is unavailable.',
    })

    const response = await request('?q=concrete')

    expect(response.status).toBe(503)
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })
})
