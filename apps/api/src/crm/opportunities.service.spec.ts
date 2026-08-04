import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { NotFoundException } from '@nestjs/common'
import type { DatabaseService } from '../database/database.service'
import { OpportunitiesService } from './opportunities.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'

const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'sales' as const,
  email: 'sales@example.test',
}

function harness() {
  const mainLimit = vi.fn().mockResolvedValue([
    {
      id: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      stage: 'lead',
      tcvCents: 100_000,
      gpCents: 20_000,
      probability: 10,
      weightedTcvCents: 10_000,
      areaSqm: 100,
      opportunityType: 'fit-out',
      closingDate: new Date('2026-08-10T00:00:00.000Z'),
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      accountName: 'Acme Office',
      projectName: 'Makati Fit-out',
    },
  ])
  const mainWhere = vi.fn().mockReturnValue({ limit: mainLimit })
  const projectJoin = vi.fn().mockReturnValue({ where: mainWhere })
  const accountJoin = vi.fn().mockReturnValue({ leftJoin: projectJoin })
  const mainFrom = vi.fn().mockReturnValue({ leftJoin: accountJoin })

  const pprfLimit = vi.fn().mockResolvedValue([{ version: 2 }])
  const pprfOrder = vi.fn().mockReturnValue({ limit: pprfLimit })
  const pprfWhere = vi.fn().mockReturnValue({ orderBy: pprfOrder })
  const pprfFrom = vi.fn().mockReturnValue({ where: pprfWhere })

  const inspectionLimit = vi.fn().mockResolvedValue([
    { id: '66666666-6666-4666-8666-666666666666', status: 'submitted' },
  ])
  const inspectionOrder = vi.fn().mockReturnValue({ limit: inspectionLimit })
  const inspectionWhere = vi.fn().mockReturnValue({ orderBy: inspectionOrder })
  const inspectionFrom = vi.fn().mockReturnValue({ where: inspectionWhere })

  const designWhere = vi
    .fn()
    .mockResolvedValue([{ designCount: 3, approvedDesignCount: 1 }])
  const designFrom = vi.fn().mockReturnValue({ where: designWhere })

  const changeRequestWhere = vi
    .fn()
    .mockResolvedValue([{ openChangeRequestCount: 2 }])
  const changeRequestFrom = vi.fn().mockReturnValue({ where: changeRequestWhere })

  const select = vi
    .fn()
    .mockReturnValueOnce({ from: mainFrom })
    .mockReturnValueOnce({ from: pprfFrom })
    .mockReturnValueOnce({ from: inspectionFrom })
    .mockReturnValueOnce({ from: designFrom })
    .mockReturnValueOnce({ from: changeRequestFrom })

  return {
    service: new OpportunitiesService({ client: { select } } as unknown as DatabaseService),
    mainLimit,
    mainWhere,
    accountJoin,
    projectJoin,
    pprfWhere,
    inspectionWhere,
    designWhere,
    changeRequestWhere,
  }
}

describe('OpportunitiesService', () => {
  it('returns a bounded tenant-scoped detail and progress summary', async () => {
    const probe = harness()

    await expect(
      probe.service.read(OPPORTUNITY_ID, PRINCIPAL)
    ).resolves.toEqual({
      opportunity: expect.objectContaining({
        id: OPPORTUNITY_ID,
        tenantId: TENANT_ID,
        accountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
        accountName: 'Acme Office',
      }),
      progress: {
        latestPprfVersion: 2,
        latestInspection: {
          id: '66666666-6666-4666-8666-666666666666',
          status: 'submitted',
        },
        designCount: 3,
        approvedDesignCount: 1,
        openChangeRequestCount: 2,
      },
    })

    const dialect = new PgDialect()
    const tenantScopedPredicates = [
      probe.mainWhere,
      probe.pprfWhere,
      probe.inspectionWhere,
      probe.designWhere,
      probe.changeRequestWhere,
    ].map((predicate) => dialect.sqlToQuery(predicate.mock.calls[0]?.[0]))
    expect(
      tenantScopedPredicates.every((query) => query.params.includes(TENANT_ID))
    ).toBe(true)
    expect(
      [probe.accountJoin, probe.projectJoin].every((join) =>
        dialect
          .sqlToQuery(join.mock.calls[0]?.[1])
          .params.includes(TENANT_ID)
      )
    ).toBe(true)
  })

  it('stops before child queries when the opportunity is outside the tenant', async () => {
    const probe = harness()
    probe.mainLimit.mockResolvedValue([])

    await expect(
      probe.service.read(OPPORTUNITY_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.pprfWhere).not.toHaveBeenCalled()
    expect(probe.inspectionWhere).not.toHaveBeenCalled()
  })
})
