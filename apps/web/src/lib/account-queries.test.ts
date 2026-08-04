import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  accountReadsUseCoreApi: vi.fn(),
  getAccountsThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: vi.fn() },
}))
vi.mock('./erp-core-client', () => coreMocks)

import { getAccountsFiltered } from './account-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

describe('getAccountsFiltered', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the tenant-gated Nest account list contract', async () => {
    coreMocks.accountReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getAccountsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: ACCOUNT_ID,
            tenantId: TENANT_ID,
            name: 'Acme Office',
            industry: 'office',
            billingAddress: null,
            primaryEmail: 'hello@example.test',
            primaryPhone: null,
            kycStatus: 'approved',
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T01:00:00.000Z',
            createdBy: null,
            opportunityCount: 2,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })

    await expect(
      getAccountsFiltered(TENANT_ID, {
        q: 'Acme',
        industry: 'office',
        kycStatus: 'approved',
        sort: 'name',
        order: 'asc',
        page: 1,
        limit: 20,
      })
    ).resolves.toMatchObject({
      total: 1,
      rows: [
        expect.objectContaining({
          id: ACCOUNT_ID,
          kyc_status: 'approved',
          opp_count: 2,
        }),
      ],
    })
    expect(coreMocks.getAccountsThroughCoreApi).toHaveBeenCalledWith({
      q: 'Acme',
      industry: 'office',
      kycStatus: 'approved',
      sort: 'name',
      order: 'asc',
      page: 1,
      limit: 20,
    })
  })

  it('fails closed when the Nest account list returns another tenant', async () => {
    coreMocks.accountReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getAccountsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: ACCOUNT_ID,
            tenantId: '99999999-9999-4999-8999-999999999999',
            name: 'Wrong Tenant',
            industry: 'office',
            billingAddress: null,
            primaryEmail: null,
            primaryPhone: null,
            kycStatus: 'pending',
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T00:00:00.000Z',
            createdBy: null,
            opportunityCount: 0,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })

    await expect(getAccountsFiltered(TENANT_ID)).rejects.toThrow(
      'invalid tenant scope'
    )
  })
})
