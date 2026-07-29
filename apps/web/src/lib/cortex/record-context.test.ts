import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCortexNodeByRef: vi.fn(),
  cortexCanSeeType: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexNodeByRef: mocks.getCortexNodeByRef,
}))

vi.mock('./rbac', () => ({
  cortexCanSeeType: mocks.cortexCanSeeType,
}))

import { authorizeCortexRecordContext } from './record-context'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'

describe('authorizeCortexRecordContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cortexCanSeeType.mockReturnValue(true)
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'project',
      ref_table: 'projects',
      ref_id: REF_ID,
      title: 'Metro MEP Retrofit',
    })
  })

  it('returns the current tenant record when source mapping and role permit it', async () => {
    await expect(
      authorizeCortexRecordContext(TENANT_ID, 'admin', {
        refTable: 'projects',
        refId: REF_ID,
      })
    ).resolves.toEqual({
      refTable: 'projects',
      refId: REF_ID,
      nodeId: NODE_ID,
      nodeType: 'project',
      title: 'Metro MEP Retrofit',
    })
  })

  it('uses the same non-enumerating null result for missing and forbidden records', async () => {
    mocks.getCortexNodeByRef.mockResolvedValueOnce(null)
    await expect(
      authorizeCortexRecordContext(TENANT_ID, 'admin', {
        refTable: 'projects',
        refId: REF_ID,
      })
    ).resolves.toBeNull()

    mocks.cortexCanSeeType.mockReturnValueOnce(false)
    await expect(
      authorizeCortexRecordContext(TENANT_ID, 'finance', {
        refTable: 'projects',
        refId: REF_ID,
      })
    ).resolves.toBeNull()
  })

  it('rejects a source table that is not canonical for the current node type', async () => {
    mocks.getCortexNodeByRef.mockResolvedValueOnce({
      id: NODE_ID,
      node_type: 'project',
      ref_table: 'invoices',
      ref_id: REF_ID,
      title: 'Corrupt mapping',
    })

    await expect(
      authorizeCortexRecordContext(TENANT_ID, 'admin', {
        refTable: 'invoices',
        refId: REF_ID,
      })
    ).resolves.toBeNull()
  })
})
