import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexNodeByRef: vi.fn(),
  cortexDescribeEntity: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexNodeByRef: mocks.getCortexNodeByRef,
  cortexDescribeEntity: mocks.cortexDescribeEntity,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'

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
    mocks.cortexDescribeEntity.mockResolvedValue({
      found: true,
      summary: 'Journal entry context',
      citations: [],
    })
  })

  it('supports registered finance sources and applies the role scope', async () => {
    const response = await request('journal_entries')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toBe('Journal entry context')
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID
    )
    expect(mocks.cortexDescribeEntity).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID,
      expect.arrayContaining(['journal_entry', 'journal_line'])
    )
  })

  it('rejects an unregistered source before graph access', async () => {
    const response = await request('unregistered_records')

    expect(response.status).toBe(400)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
    expect(mocks.cortexDescribeEntity).not.toHaveBeenCalled()
  })

  it('returns a non-enumerating 404 when the role cannot see the type', async () => {
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'sales',
    })

    const response = await request('journal_entries')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      found: false,
      summary: '',
      citations: [],
    })
    expect(mocks.cortexDescribeEntity).not.toHaveBeenCalled()
  })

  it('rejects a node whose type does not own the requested source', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      node_type: 'invoice',
    })

    const response = await request('journal_entries')

    expect(response.status).toBe(404)
    expect(mocks.cortexDescribeEntity).not.toHaveBeenCalled()
  })
})
