import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireUserProfile: vi.fn(),
  runSignedBomAward: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@third-code-erp/auth', () => ({
  can: () => true,
  requireUserProfile: mocks.requireUserProfile,
}))

vi.mock('@third-code-erp/database', async (importOriginal) => ({
  db: { transaction: mocks.transaction },
  liveProjectCondition: (await importOriginal<typeof import('@third-code-erp/database')>())
    .liveProjectCondition,
}))

vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@/lib/operations/award-automation', () => ({
  runSignedBomAward: mocks.runSignedBomAward,
}))

import { awardLockedBom } from './award-actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '44444444-4444-4444-8444-444444444444'

function transactionWith(selectResults: unknown[][]) {
  const conditions: unknown[] = []
  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.where = vi.fn((condition: unknown) => {
      conditions.push(condition)
      return chain
    })
    chain.limit = vi.fn(() => chain)
    chain.for = vi.fn(async () => result)
    return chain
  })
  const tx = { execute: vi.fn(), select }
  mocks.transaction.mockImplementationOnce(async (callback: (t: typeof tx) => unknown) => callback(tx))
  return conditions
}

function awardForm(): FormData {
  const form = new FormData()
  form.set('projectId', PROJECT_ID)
  form.set('bomId', BOM_ID)
  form.set('downPaymentPercent', '20')
  return form
}

describe('awardLockedBom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'owner',
    })
  })

  it('treats a locked BOM of a retired project as not found', async () => {
    // Actor and tenant pass; the BOM read finds nothing because the project is retired.
    const conditions = transactionWith([[{ role: 'owner' }], [{ id: TENANT_ID }], []])

    await expect(awardLockedBom(awardForm())).resolves.toEqual({
      ok: false,
      error: 'BOM not found in this project.',
    })

    const bomWhere = new PgDialect().sqlToQuery(conditions[2] as SQL)
    expect(bomWhere.sql).toContain(
      'exists (select "id" from "projects" where ("projects"."id" = $4 and "projects"."tenant_id" = $5 and "projects"."deleted_at" is null))'
    )
    expect(bomWhere.params).toEqual([TENANT_ID, BOM_ID, PROJECT_ID, PROJECT_ID, TENANT_ID])
    expect(mocks.runSignedBomAward).not.toHaveBeenCalled()
  })
})
