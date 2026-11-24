import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

// Real Drizzle schema and operators, so the tenant predicates are rendered as SQL.
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  getUserProfile: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
  AuthError: class AuthError extends Error {},
}))
vi.mock('@third-code-erp/database', async () => {
  const { sql } = await import('drizzle-orm')
  return {
    db: { select: mocks.select, transaction: mocks.transaction },
    liveProjectCondition: (projectId: string, tenantId: string) =>
      sql`live_project(${projectId}, ${tenantId})`,
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ writeAuditLogInTransaction: vi.fn() }))
vi.mock('@/lib/inngest', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/erp-core-client', () => ({
  dispatchApprovedBomRfqThroughCoreApi: vi.fn(),
  rfqAutoDispatchUsesCoreApi: vi.fn(),
}))
vi.mock('../project-detail-access', () => ({ getProjectDetailAccess: () => ({ bom: true }) }))
vi.mock('@/lib/operations/bom-supplier-matching', () => ({
  selectCanonicalSupplierOptions: vi.fn(),
}))

import { listPendingTakeoffRows, resolveTakeoffUnresolvedItem, updateBomLineItem } from './actions'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '88888888-8888-4888-8888-888888888888'
const LINE_ITEM_ID = '99999999-9999-4999-8999-999999999999'
const ITEM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

type Method = 'from' | 'innerJoin' | 'leftJoin' | 'where' | 'orderBy' | 'limit' | 'for'
type Builder = Record<Method, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled?: (value: unknown[]) => unknown) => Promise<unknown>
}

function builder(rows: unknown[]): Builder {
  const chain = {
    then: (onFulfilled?: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled),
  } as Builder
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'for'] as const) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  return chain
}

function rendered(fn: ReturnType<typeof vi.fn>, arg = 0) {
  return new PgDialect().sqlToQuery(fn.mock.calls[0]![arg] as SQL)
}

describe('takeoff review and line edit stay inside the caller tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const profile = { tenantId: TENANT_ID, user: { id: USER_ID }, role: 'estimator' }
    mocks.getUserProfile.mockResolvedValue(profile)
    mocks.requireUserProfile.mockResolvedValue(profile)
    mocks.can.mockReturnValue(true)
  })

  it('lists pending rows only from the caller tenant BOM and its joined lines', async () => {
    const query = builder([])
    mocks.select.mockReturnValueOnce(query)

    await expect(listPendingTakeoffRows(PROJECT_ID, BOM_ID)).resolves.toEqual([])

    const where = rendered(query.where)
    expect(where.sql).toContain('"takeoff_unresolved_items"."tenant_id" = $')
    expect(where.sql).toContain('"boms"."tenant_id" = $')
    expect(where.params.filter((value) => value === TENANT_ID)).toHaveLength(3)
    expect(rendered(query.innerJoin, 1).sql).toContain(
      '"takeoff_unresolved_items"."tenant_id" = "bom_line_items"."tenant_id"'
    )
    expect(rendered(query.leftJoin, 1).sql).toContain(
      '"boq_divisions"."tenant_id" = "bom_line_items"."tenant_id"'
    )
  })

  it('answers not found for a takeoff row in another tenant and opens no transaction', async () => {
    const lookup = builder([])
    mocks.select.mockReturnValueOnce(lookup)

    await expect(
      resolveTakeoffUnresolvedItem({ itemId: ITEM_ID, projectId: PROJECT_ID, quantity: '5' })
    ).resolves.toEqual({ error: 'Pending takeoff row not found' })

    const where = rendered(lookup.where)
    expect(where.sql).toContain('"takeoff_unresolved_items"."tenant_id" = $')
    expect(where.sql).toContain('"boms"."tenant_id" = $')
    expect(where.params).toEqual(expect.arrayContaining([ITEM_ID, TENANT_ID, PROJECT_ID]))
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('locks the BOM by tenant before editing a line, and stops when it is not the caller tenant', async () => {
    const lock = builder([])
    mocks.transaction.mockImplementation(async (callback) => callback({ select: () => lock }))

    await expect(
      updateBomLineItem(LINE_ITEM_ID, BOM_ID, PROJECT_ID, {
        description: 'Concrete slab work',
        unit: 'm',
        quantity: '12.50',
        unit_cost_cents: 2_500,
        code: 'C-01',
        expected_updated_at: '2026-11-20T08:30:00.000Z',
      })
    ).resolves.toEqual({ error: 'BOM not found' })

    const where = rendered(lock.where)
    expect(where.sql).toContain('"boms"."tenant_id" = $')
    expect(where.params).toEqual(expect.arrayContaining([BOM_ID, PROJECT_ID, TENANT_ID]))
  })
})
