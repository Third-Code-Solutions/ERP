import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))

import { getOpportunityEditContext } from './opportunity-edit-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'

type Builder = Record<'from' | 'leftJoin' | 'where' | 'orderBy' | 'limit', ReturnType<typeof vi.fn>> & {
  then: (onFulfilled?: (value: unknown[]) => unknown) => Promise<unknown>
}

function queued(rows: unknown[]): Builder {
  const builder = {
    then: (onFulfilled?: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled),
  } as Builder
  for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit'] as const) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  mocks.select.mockReturnValueOnce(builder)
  return builder
}

function rendered(fn: ReturnType<typeof vi.fn>, arg = 0) {
  return new PgDialect().sqlToQuery(fn.mock.calls[0]![arg] as SQL)
}

describe('getOpportunityEditContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads only the detail fields, scoped to the tenant, when the viewer cannot edit', async () => {
    const row = queued([
      {
        remarks: 'Note',
        lostReason: null,
        repId: 'r1',
        repName: 'Rep',
        updatedAt: new Date('2026-11-20T03:04:05.678Z'),
      },
    ])

    await expect(
      getOpportunityEditContext({
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        accountId: ACCOUNT_ID,
        projectId: null,
        canEdit: false,
      })
    ).resolves.toEqual({
      remarks: 'Note',
      lostReason: null,
      repId: 'r1',
      repName: 'Rep',
      updatedAt: '2026-11-20T03:04:05.678Z',
      reps: [],
      linkableProjects: [],
    })

    expect(mocks.select).toHaveBeenCalledOnce()
    expect(rendered(row.where).params).toEqual([OPPORTUNITY_ID, TENANT_ID])
    const join = rendered(row.leftJoin, 1)
    expect(join.sql).toContain('"users"."tenant_id"')
    expect(join.params).toEqual([TENANT_ID])
  })

  it('returns an empty context for an opportunity outside the tenant', async () => {
    queued([])

    await expect(
      getOpportunityEditContext({
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        accountId: null,
        projectId: null,
        canEdit: false,
      })
    ).resolves.toMatchObject({ remarks: null, repId: null, repName: null })
  })

  it('scopes the rep and linkable-project pick-lists to the tenant and account', async () => {
    queued([{ remarks: null, lostReason: null, repId: null, repName: null, updatedAt: new Date() }])
    const reps = queued([{ id: 'u1', name: 'Sales One' }])
    const projectsQuery = queued([{ id: 'p1', name: 'Tower A' }])
    const linkedElsewhere = queued([])

    await expect(
      getOpportunityEditContext({
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        accountId: ACCOUNT_ID,
        projectId: null,
        canEdit: true,
      })
    ).resolves.toMatchObject({
      reps: [{ id: 'u1', name: 'Sales One' }],
      linkableProjects: [{ id: 'p1', name: 'Tower A' }],
    })

    const repWhere = rendered(reps.where)
    expect(repWhere.sql).toContain('"users"."tenant_id"')
    expect(repWhere.params.slice(0, 2)).toEqual([TENANT_ID, 'active'])
    const projectWhere = rendered(projectsQuery.where)
    expect(projectWhere.sql).toContain('"projects"."tenant_id"')
    expect(projectWhere.params.slice(0, 2)).toEqual([TENANT_ID, ACCOUNT_ID])
    const subquery = rendered(linkedElsewhere.where)
    expect(subquery.sql).toContain('"opportunities"."tenant_id"')
    expect(subquery.params).toEqual([TENANT_ID])
  })

  it('offers no projects once the opportunity is already linked', async () => {
    queued([{ remarks: null, lostReason: null, repId: null, repName: null, updatedAt: new Date() }])
    queued([])

    const context = await getOpportunityEditContext({
      tenantId: TENANT_ID,
      opportunityId: OPPORTUNITY_ID,
      accountId: ACCOUNT_ID,
      projectId: '55555555-5555-4555-8555-555555555555',
      canEdit: true,
    })

    expect(context.linkableProjects).toEqual([])
    expect(mocks.select).toHaveBeenCalledTimes(2)
  })
})
