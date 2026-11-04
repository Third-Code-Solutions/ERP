import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../client'
import { billedInvoicesCondition, billedPercentBps } from './billed-percent'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('billed progress percent (D-6)', () => {
  it('scopes to the tenant and project and drops cancelled or reversed invoices', () => {
    const condition = billedInvoicesCondition(TENANT_ID, PROJECT_ID)
    if (!condition) throw new Error('Missing billed-invoice condition')
    const query = new PgDialect().sqlToQuery(condition)

    expect(query.sql).toBe(
      '("invoices"."tenant_id" = $1 and "invoices"."project_id" = $2 and "invoices"."status" <> $3 and "invoices"."reversed_at" is null)'
    )
    expect(query.params).toEqual([TENANT_ID, PROJECT_ID, 'cancelled'])
    // The award down-payment draft (AWD-DP-*) is not excluded: it counts.
    expect(query.sql).not.toContain('invoice_number')
  })

  it('returns the summed basis points as a number, 0 when nothing is billed', async () => {
    const where = vi
      .fn<(condition: SQL | undefined) => Promise<Array<{ percentBps: string }>>>()
      .mockResolvedValueOnce([{ percentBps: '7500' }])
      .mockResolvedValueOnce([])
    const executor = {
      select: vi.fn(() => ({ from: () => ({ where }) })),
    } as unknown as Pick<Database, 'select'>

    await expect(billedPercentBps(executor, TENANT_ID, PROJECT_ID)).resolves.toBe(7500)
    await expect(billedPercentBps(executor, TENANT_ID, PROJECT_ID)).resolves.toBe(0)
  })
})
