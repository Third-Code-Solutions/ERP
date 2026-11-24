import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@third-code-erp/database', async () => {
  const { sql } = await import('drizzle-orm')
  return {
    db: { select: mocks.select },
    liveProjectCondition: (projectId: unknown, tenantId: string) =>
      sql`live_project(${projectId}, ${tenantId})`,
  }
})

import { listApprovedBomsWithoutRfq } from './boms-without-rfq'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

type Method = 'from' | 'innerJoin' | 'where' | 'orderBy' | 'limit'
type Builder = Record<Method, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled?: (value: unknown[]) => unknown) => Promise<unknown>
}

function queued(rows: unknown[]): Builder {
  const builder = {
    then: (onFulfilled?: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled),
  } as Builder
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit'] as const) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  mocks.select.mockReturnValueOnce(builder)
  return builder
}

function rendered(fn: ReturnType<typeof vi.fn>, arg = 0) {
  return new PgDialect().sqlToQuery(fn.mock.calls[0]![arg] as SQL)
}

describe('listApprovedBomsWithoutRfq', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the rows the tenant-scoped query found', async () => {
    const bom = { id: 'b1', status: 'approved', label: null, version: 2, project_name: 'Tower A' }
    queued([bom])

    await expect(listApprovedBomsWithoutRfq(TENANT_ID)).resolves.toEqual([bom])
  })

  it('scopes the BOM, its project and the RFQ check to the caller tenant', async () => {
    const query = queued([])

    await expect(listApprovedBomsWithoutRfq(TENANT_ID)).resolves.toEqual([])

    const join = rendered(query.innerJoin, 1)
    expect(join.sql).toContain('"projects"."tenant_id" = $')
    expect(join.params).toEqual([TENANT_ID])

    const where = rendered(query.where)
    expect(where.sql).toContain('"boms"."tenant_id" = $')
    expect(where.sql).toContain('"boms"."status" in ($')
    expect(where.sql).toMatch(/not exists \(\s*select 1 from "rfqs"/)
    expect(where.sql).toContain('"rfqs"."tenant_id" = $')
    // Only the latest approved or locked version of the project's BOM is offered.
    expect(where.sql).toMatch(
      /not exists \(\s*select 1 from "boms" as newer\s+where newer\.tenant_id = \$\d+\s+and newer\.project_id = "boms"\."project_id"\s+and newer\.status in \('approved', 'locked'\)\s+and newer\.version > "boms"\."version"/
    )
    // BOM tenant, live-project tenant, the newer-version check and the RFQ check each bind the caller tenant.
    expect(where.params).toEqual([TENANT_ID, 'approved', 'locked', TENANT_ID, TENANT_ID, TENANT_ID])
    expect(query.limit).toHaveBeenCalledWith(50)
  })
})
