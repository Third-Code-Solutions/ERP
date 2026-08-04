import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexGraph: vi.fn(),
  getCortexFocusedGraph: vi.fn(),
  getCortexNodeByRef: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexGraph: mocks.getCortexGraph,
  getCortexFocusedGraph: mocks.getCortexFocusedGraph,
  getCortexNodeByRef: mocks.getCortexNodeByRef,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

function request(query = '') {
  return GET(new NextRequest(`http://localhost/api/cortex/graph${query}`))
}

describe('Cortex focused graph authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
    })
    mocks.getCortexGraph.mockResolvedValue({ nodes: [], links: [] })
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'journal_entry',
    })
    mocks.getCortexFocusedGraph.mockResolvedValue({
      focusNodeId: NODE_ID,
      nodes: [{ id: NODE_ID }],
      links: [],
    })
  })

  it('requires an authenticated profile', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    expectPrivate(response)
    expect(mocks.getCortexGraph).not.toHaveBeenCalled()
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('preserves the whole-graph contract without focus parameters', async () => {
    const response = await request()

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(mocks.getCortexGraph).toHaveBeenCalledWith(
      TENANT_ID,
      1500,
      expect.arrayContaining(['journal_entry'])
    )
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('rejects partial or malformed focus before database access', async () => {
    const partial = await request('?refTable=journal_entries')
    const malformed = await request(
      '?refTable=journal_entries&refId=not-a-uuid'
    )

    expect(partial.status).toBe(400)
    expect(malformed.status).toBe(400)
    expectPrivate(partial)
    expectPrivate(malformed)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('returns an authorized, tenant-scoped neighborhood', async () => {
    const response = await request(
      `?refTable=journal_entries&refId=${REF_ID}`
    )

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID
    )
    expect(mocks.getCortexFocusedGraph).toHaveBeenCalledWith(
      TENANT_ID,
      NODE_ID,
      40,
      expect.arrayContaining(['journal_entry', 'journal_line'])
    )
    expect(mocks.getCortexGraph).not.toHaveBeenCalled()
  })

  it('does not enumerate records hidden from the current role', async () => {
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'sales',
    })

    const response = await request(
      `?refTable=journal_entries&refId=${REF_ID}`
    )

    expect(response.status).toBe(404)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error: 'Focused record not found',
    })
    expect(mocks.getCortexFocusedGraph).not.toHaveBeenCalled()
  })

  it('rejects a node type that does not own the requested source', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'invoice',
    })

    const response = await request(
      `?refTable=journal_entries&refId=${REF_ID}`
    )

    expect(response.status).toBe(404)
    expectPrivate(response)
    expect(mocks.getCortexFocusedGraph).not.toHaveBeenCalled()
  })
})
