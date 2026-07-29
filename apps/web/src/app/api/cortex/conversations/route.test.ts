import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  listCortexConversations: vi.fn(),
  authorizeCortexRecordContext: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  listCortexConversations: mocks.listCortexConversations,
}))

vi.mock('@/lib/cortex/record-context', () => ({
  authorizeCortexRecordContext: mocks.authorizeCortexRecordContext,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'
const CREATED_AT = new Date('2026-07-29T00:00:00.000Z')

describe('Cortex conversation history context authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
      user: { id: USER_ID },
    })
    mocks.listCortexConversations.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Whole company',
        context_ref_table: null,
        context_ref_id: null,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Invoice',
        context_ref_table: 'invoices',
        context_ref_id: REF_ID,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        title: 'Revoked project',
        context_ref_table: 'projects',
        context_ref_id: REF_ID,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    ])
    mocks.authorizeCortexRecordContext
      .mockResolvedValueOnce({
        refTable: 'invoices',
        refId: REF_ID,
        nodeId: '77777777-7777-4777-8777-777777777777',
        nodeType: 'invoice',
        title: 'INV-2026-001',
      })
      .mockResolvedValueOnce(null)
  })

  it('returns unscoped and currently authorized scoped conversations only', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/cortex/conversations')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.conversations).toHaveLength(2)
    expect(body.conversations[0].context).toBeNull()
    expect(body.conversations[1].context).toMatchObject({
      refTable: 'invoices',
      refId: REF_ID,
      nodeType: 'invoice',
    })
    expect(body.conversations[1]).not.toHaveProperty('context_ref_table')
    expect(mocks.authorizeCortexRecordContext).toHaveBeenCalledTimes(2)
  })

  it('rejects unauthenticated history before database access', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('http://localhost/api/cortex/conversations')
    )

    expect(response.status).toBe(401)
    expect(mocks.listCortexConversations).not.toHaveBeenCalled()
  })
})
