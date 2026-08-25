import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const coreMocks = vi.hoisted(() => ({
  getOpportunityThroughCoreApi: vi.fn(),
  opportunityReadsUseCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: vi.fn() },
}))
vi.mock('./erp-core-client', () => coreMocks)

import { db } from '@third-code-erp/database'
import { getOpportunityDetail } from './opportunity-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'

const CORE_RESULT = {
  opportunity: {
    id: OPPORTUNITY_ID,
    tenantId: TENANT_ID,
    stage: 'lead' as const,
    tcvCents: 100_000,
    gpCents: 20_000,
    probability: 10,
    weightedTcvCents: 10_000,
    areaSqm: 100,
    opportunityType: 'fit-out',
    closingDate: '2026-08-10T00:00:00.000Z',
    accountId: '33333333-3333-4333-8333-333333333333',
    projectId: null,
    prospectiveProjectName: 'Acme office fit-out',
    accountName: 'Acme Office',
    projectName: null,
  },
  progress: {
    latestPprfVersion: 2,
    latestInspection: {
      id: '55555555-5555-4555-8555-555555555555',
      status: 'submitted' as const,
    },
    designCount: 3,
    approvedDesignCount: 1,
    openChangeRequestCount: 2,
  },
}

describe('getOpportunityDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps the tenant-gated Nest detail result for the existing page', async () => {
    coreMocks.opportunityReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getOpportunityThroughCoreApi.mockResolvedValue({
      ok: true,
      data: CORE_RESULT,
    })

    await expect(
      getOpportunityDetail(TENANT_ID, OPPORTUNITY_ID)
    ).resolves.toMatchObject({
      opp: {
        id: OPPORTUNITY_ID,
        account_id: CORE_RESULT.opportunity.accountId,
        tcv_cents: 100_000,
      },
      latestPprfVersion: 2,
      designCount: 3,
      approvedDesignCount: 1,
      openCrCount: 2,
    })
    expect(coreMocks.getOpportunityThroughCoreApi).toHaveBeenCalledWith(
      OPPORTUNITY_ID
    )
  })

  it('fails closed when the Nest detail result belongs to another tenant', async () => {
    coreMocks.opportunityReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getOpportunityThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ...CORE_RESULT,
        opportunity: { ...CORE_RESULT.opportunity, tenantId: '99999999-9999-4999-8999-999999999999' },
      },
    })

    await expect(
      getOpportunityDetail(TENANT_ID, OPPORTUNITY_ID)
    ).rejects.toThrow('invalid tenant scope')
  })

  it('returns null for an API not-found result', async () => {
    coreMocks.opportunityReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getOpportunityThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Opportunity not found.',
    })

    await expect(
      getOpportunityDetail(TENANT_ID, OPPORTUNITY_ID)
    ).resolves.toBeNull()
  })

  it('keeps the legacy graph tenant-scoped', async () => {
    coreMocks.opportunityReadsUseCoreApi.mockReturnValue(false)

    const mainLimit = vi.fn().mockResolvedValue([
      {
        id: OPPORTUNITY_ID,
        stage: 'lead',
        tcv_cents: 100_000,
        gp_cents: 20_000,
        probability: 10,
        weighted_tcv_cents: 10_000,
        area_sqm: 100,
        opportunity_type: 'fit-out',
        closing_date: new Date('2026-08-10T00:00:00.000Z'),
        account_id: '33333333-3333-4333-8333-333333333333',
        project_id: null,
        account_name: 'Acme Office',
        project_name: null,
      },
    ])
    const mainWhere = vi.fn().mockReturnValue({ limit: mainLimit })
    const projectJoin = vi.fn().mockReturnValue({ where: mainWhere })
    const accountJoin = vi.fn().mockReturnValue({ leftJoin: projectJoin })
    const mainFrom = vi.fn().mockReturnValue({ leftJoin: accountJoin })

    const pprfLimit = vi.fn().mockResolvedValue([{ version: 1 }])
    const pprfOrder = vi.fn().mockReturnValue({ limit: pprfLimit })
    const pprfWhere = vi.fn().mockReturnValue({ orderBy: pprfOrder })
    const pprfFrom = vi.fn().mockReturnValue({ where: pprfWhere })
    const inspectionLimit = vi.fn().mockResolvedValue([])
    const inspectionOrder = vi.fn().mockReturnValue({ limit: inspectionLimit })
    const inspectionWhere = vi.fn().mockReturnValue({ orderBy: inspectionOrder })
    const inspectionFrom = vi.fn().mockReturnValue({ where: inspectionWhere })
    const designWhere = vi.fn().mockResolvedValue([
      { id: '55555555-5555-4555-8555-555555555555', is_client_approved: true },
    ])
    const designFrom = vi.fn().mockReturnValue({ where: designWhere })
    const crWhere = vi.fn().mockResolvedValue([])
    const crFrom = vi.fn().mockReturnValue({ where: crWhere })

    vi.mocked(db.select)
      .mockReturnValueOnce({ from: mainFrom } as never)
      .mockReturnValueOnce({ from: pprfFrom } as never)
      .mockReturnValueOnce({ from: inspectionFrom } as never)
      .mockReturnValueOnce({ from: designFrom } as never)
      .mockReturnValueOnce({ from: crFrom } as never)

    await expect(
      getOpportunityDetail(TENANT_ID, OPPORTUNITY_ID)
    ).resolves.toMatchObject({
      opp: { id: OPPORTUNITY_ID },
      latestPprfVersion: 1,
      designCount: 1,
      approvedDesignCount: 1,
    })

    const dialect = new PgDialect()
    const predicates = [mainWhere, pprfWhere, inspectionWhere, designWhere, crWhere]
      .map((where) => dialect.sqlToQuery(where.mock.calls[0]?.[0]))
    expect(predicates.every((query) => query.params.includes(TENANT_ID))).toBe(true)
    expect(
      [accountJoin, projectJoin].every((join) =>
        dialect.sqlToQuery(join.mock.calls[0]?.[1]).params.includes(TENANT_ID)
      )
    ).toBe(true)
  })
})
