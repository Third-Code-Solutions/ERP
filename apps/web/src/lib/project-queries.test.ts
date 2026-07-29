import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
  },
}))

import { getProject } from './project-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('getProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
  })

  it('queries by tenant and Project ID together', async () => {
    const row = { id: PROJECT_ID, tenant_id: TENANT_ID }
    mocks.limit.mockResolvedValue([row])

    await expect(getProject(TENANT_ID, PROJECT_ID)).resolves.toBe(row)

    const condition = mocks.where.mock.calls[0]?.[0]
    const query = new PgDialect().sqlToQuery(condition)
    expect(query.sql).toContain('"projects"."tenant_id" = $1')
    expect(query.sql).toContain('"projects"."id" = $2')
    expect(query.params).toEqual([TENANT_ID, PROJECT_ID])
    expect(mocks.limit).toHaveBeenCalledWith(1)
  })

  it('returns null when no same-tenant Project exists', async () => {
    mocks.limit.mockResolvedValue([])

    await expect(getProject(TENANT_ID, PROJECT_ID)).resolves.toBeNull()
  })
})
