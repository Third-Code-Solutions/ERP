import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  accountKycQueueReadsUseCoreApi: vi.fn(),
  accountReadsUseCoreApi: vi.fn(),
  getAccountThroughCoreApi: vi.fn(),
  getAccountsThroughCoreApi: vi.fn(),
  getKycQueueThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: vi.fn() },
}))
vi.mock('./erp-core-client', () => coreMocks)

import { db } from '@third-code-erp/database'
import { getAccountDetail, getAccountsFiltered, getKycQueue } from './account-queries'

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

describe('getAccountDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps the tenant-gated Nest account detail graph for the existing page', async () => {
    coreMocks.accountReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getAccountThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        account: {
          id: ACCOUNT_ID,
          tenantId: TENANT_ID,
          name: 'Acme Office',
          industry: 'office',
          billingAddress: '1 Main St',
          primaryEmail: 'hello@example.test',
          primaryPhone: null,
          kycStatus: 'approved',
          createdAt: '2026-08-04T00:00:00.000Z',
          updatedAt: '2026-08-04T01:00:00.000Z',
          createdBy: null,
          opportunityCount: 1,
          kycNotes: null,
          kycDecidedAt: null,
          kycDecidedBy: null,
          cnpsScoreX10: null,
        },
        contacts: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            tenantId: TENANT_ID,
            accountId: ACCOUNT_ID,
            fullName: 'Ada Example',
            email: 'ada@example.test',
            phone: null,
            roleTitle: 'Owner',
            isPrimary: true,
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T00:00:00.000Z',
          },
        ],
        kycArtifacts: [],
        opportunities: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            tenantId: TENANT_ID,
            accountId: ACCOUNT_ID,
            projectId: null,
            stage: 'lead',
            tcvCents: 100,
            gpCents: 20,
            probability: 10,
            weightedTcvCents: 10,
            areaSqm: null,
            opportunityType: null,
            closingDate: null,
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T00:00:00.000Z',
          },
        ],
        projects: [],
      },
    })

    await expect(getAccountDetail(TENANT_ID, ACCOUNT_ID)).resolves.toMatchObject({
      account: { id: ACCOUNT_ID, tenant_id: TENANT_ID },
      contactRows: [expect.objectContaining({ account_id: ACCOUNT_ID })],
      oppRows: [expect.objectContaining({ id: '55555555-5555-4555-8555-555555555555' })],
    })
    expect(coreMocks.getAccountThroughCoreApi).toHaveBeenCalledWith(ACCOUNT_ID)
  })

  it('fails closed when the detail graph contains another tenant or account', async () => {
    coreMocks.accountReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getAccountThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        account: {
          id: ACCOUNT_ID,
          tenantId: TENANT_ID,
          name: 'Acme Office',
          industry: 'office',
          billingAddress: null,
          primaryEmail: null,
          primaryPhone: null,
          kycStatus: 'pending',
          createdAt: '2026-08-04T00:00:00.000Z',
          updatedAt: '2026-08-04T00:00:00.000Z',
          createdBy: null,
          opportunityCount: 1,
          kycNotes: null,
          kycDecidedAt: null,
          kycDecidedBy: null,
          cnpsScoreX10: null,
        },
        contacts: [],
        kycArtifacts: [],
        opportunities: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            tenantId: '99999999-9999-4999-8999-999999999999',
            accountId: ACCOUNT_ID,
            projectId: null,
            stage: 'lead',
            tcvCents: 0,
            gpCents: 0,
            probability: 0,
            weightedTcvCents: 0,
            areaSqm: null,
            opportunityType: null,
            closingDate: null,
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T00:00:00.000Z',
          },
        ],
        projects: [],
      },
    })

    await expect(getAccountDetail(TENANT_ID, ACCOUNT_ID)).rejects.toThrow(
      'invalid tenant scope'
    )
  })
})

describe('getKycQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps the tenant-gated Nest KYC queue contract', async () => {
    coreMocks.accountKycQueueReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getKycQueueThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: ACCOUNT_ID,
            tenantId: TENANT_ID,
            name: 'Acme Office',
            industry: 'office',
            createdAt: '2026-08-04T00:00:00.000Z',
            artifactCount: 3,
          },
        ],
        total: 1,
        limit: 200,
        truncated: false,
      },
    })

    await expect(getKycQueue(TENANT_ID)).resolves.toEqual([
      expect.objectContaining({
        id: ACCOUNT_ID,
        tenant_id: TENANT_ID,
        artifact_count: 3,
      }),
    ])
    expect(coreMocks.getKycQueueThroughCoreApi).toHaveBeenCalledWith()
  })

  it('fails closed when the KYC queue contains another tenant', async () => {
    coreMocks.accountKycQueueReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getKycQueueThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: ACCOUNT_ID,
            tenantId: '99999999-9999-4999-8999-999999999999',
            name: 'Wrong Tenant',
            industry: 'office',
            createdAt: '2026-08-04T00:00:00.000Z',
            artifactCount: 0,
          },
        ],
        total: 1,
        limit: 200,
        truncated: false,
      },
    })

    await expect(getKycQueue(TENANT_ID)).rejects.toThrow('invalid tenant scope')
  })

  it('keeps the legacy KYC queue tenant-scoped and capped', async () => {
    coreMocks.accountKycQueueReadsUseCoreApi.mockReturnValue(false)
    const limit = vi.fn().mockResolvedValue([
      {
        id: ACCOUNT_ID,
        tenant_id: TENANT_ID,
        name: 'Acme Office',
        industry: 'office',
        created_at: new Date('2026-08-04T00:00:00.000Z'),
        artifact_count: 2,
      },
    ])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const groupBy = vi.fn().mockReturnValue({ orderBy })
    const where = vi.fn().mockReturnValue({ groupBy })
    const leftJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ leftJoin })
    vi.mocked(db.select).mockReturnValue({ from } as never)

    await expect(getKycQueue(TENANT_ID)).resolves.toEqual([
      expect.objectContaining({ id: ACCOUNT_ID, artifact_count: 2 }),
    ])
    expect(limit).toHaveBeenCalledWith(200)
    expect(where).toHaveBeenCalled()
    expect(leftJoin).toHaveBeenCalled()
  })
})
