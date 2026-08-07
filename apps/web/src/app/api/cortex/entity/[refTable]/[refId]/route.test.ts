import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexNodeByRef: vi.fn(),
  getCortexContextPack: vi.fn(),
  describeContextPack: vi.fn(),
  cortexEntityReadsUseCoreApi: vi.fn(),
  getCortexEntityThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexNodeByRef: mocks.getCortexNodeByRef,
  getCortexContextPack: mocks.getCortexContextPack,
  describeContextPack: mocks.describeContextPack,
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexEntityReadsUseCoreApi: mocks.cortexEntityReadsUseCoreApi,
  getCortexEntityThroughCoreApi: mocks.getCortexEntityThroughCoreApi,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

function request(refTable: string, refId = REF_ID) {
  return GET(
    new NextRequest(`http://localhost/api/cortex/entity/${refTable}/${refId}`),
    { params: Promise.resolve({ refTable, refId }) }
  )
}

describe('Cortex entity lookup registry boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
    })
    mocks.getCortexNodeByRef.mockResolvedValue({
      node_type: 'journal_entry',
    })
    mocks.getCortexContextPack.mockResolvedValue({
      node: {
        id: '33333333-3333-4333-8333-333333333333',
      },
      neighbors: [],
      provenance: [],
      citations: [],
    })
    mocks.describeContextPack.mockReturnValue('Journal entry context')
    mocks.cortexEntityReadsUseCoreApi.mockReturnValue(false)
  })

  it('supports registered finance sources and applies the role scope', async () => {
    const response = await request('journal_entries')
    const body = await response.json()

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(body.summary).toBe('Journal entry context')
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID
    )
    expect(mocks.getCortexContextPack).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID,
      {
        neighborLimit: 12,
        provenanceLimit: 6,
        nodeTypes: expect.arrayContaining([
          'journal_entry',
          'journal_line',
        ]),
      }
    )
    expect(body.relationships).toEqual([])
    expect(body.evidence).toEqual([])
  })

  it('rejects an unregistered source before graph access', async () => {
    const response = await request('unregistered_records')

    expect(response.status).toBe(400)
    expectPrivate(response)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
    expect(mocks.getCortexContextPack).not.toHaveBeenCalled()
  })

  it('returns a non-enumerating 404 when the role cannot see the type', async () => {
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'sales',
    })

    const response = await request('journal_entries')

    expect(response.status).toBe(404)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      found: false,
      summary: '',
      citations: [],
    })
    expect(mocks.getCortexContextPack).not.toHaveBeenCalled()
  })

  it('rejects a node whose type does not own the requested source', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      node_type: 'invoice',
    })

    const response = await request('journal_entries')

    expect(response.status).toBe(404)
    expectPrivate(response)
    expect(mocks.getCortexContextPack).not.toHaveBeenCalled()
  })

  it('uses the authenticated Core path for an enabled tenant', async () => {
    mocks.cortexEntityReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexEntityThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        found: true,
        summary: 'Core journal context',
        citations: [],
        relationships: [],
        evidence: [],
      },
    })

    const response = await request('journal_entries')

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toMatchObject({
      found: true,
      summary: 'Core journal context',
    })
    expect(mocks.getCortexEntityThroughCoreApi).toHaveBeenCalledWith({
      refTable: 'journal_entries',
      refId: REF_ID,
    })
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('fails closed and preserves the non-enumerating Core 404', async () => {
    mocks.cortexEntityReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexEntityThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: 'Cortex entity service is unavailable.',
    })

    const unavailable = await request('journal_entries')
    expect(unavailable.status).toBe(503)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()

    mocks.getCortexEntityThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Cortex entity not found.',
    })
    const missing = await request('journal_entries')
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toEqual({
      found: false,
      summary: '',
      citations: [],
    })
  })
})
