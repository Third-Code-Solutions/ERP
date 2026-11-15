import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../client'
import { loadRateCardCoverage } from './rate-card-coverage'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-11-15T00:00:00.000Z')

type Card = {
  id: string
  code: string
  unit: string | null
  vendorId: string | null
  unitPriceCents: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

function card(overrides: Partial<Card>): Card {
  return {
    id: 'card-1',
    code: 'MAT-001',
    unit: 'pcs',
    vendorId: VENDOR_ID,
    unitPriceCents: 10_000,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    ...overrides,
  }
}

function executorReturning(cards: Card[], vendorIds: string[]) {
  const wheres: SQL[] = []
  const results: unknown[][] = [cards, vendorIds.map((id) => ({ id }))]
  const select = vi.fn(() => {
    const result = results.shift()
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (condition: SQL) => {
        wheres.push(condition)
        return Promise.resolve(result)
      },
    }
    return chain
  })
  return { executor: { select } as unknown as Pick<Database, 'select'>, select, wheres }
}

describe('RFQ rate-card coverage', () => {
  it('covers a line only when the picked card names a known vendor and matches its unit', async () => {
    const { executor, wheres } = executorReturning([card({})], [VENDOR_ID])
    const isContracted = await loadRateCardCoverage(executor, TENANT_ID, ['MAT-001'], NOW)

    expect(isContracted({ code: 'MAT-001', unit: 'PCS ' })).toBe(true)
    expect(isContracted({ code: 'MAT-001', unit: 'pc' })).toBe(false)
    expect(isContracted({ code: 'MAT-001', unit: null })).toBe(false)
    expect(isContracted({ code: 'MAT-002', unit: 'pcs' })).toBe(false)
    expect(isContracted({ code: null, unit: 'pcs' })).toBe(false)

    const cardsWhere = new PgDialect().sqlToQuery(wheres[0]!).sql
    expect(cardsWhere).toContain('"rate_cards"."tenant_id" = $1')
    expect(cardsWhere).toContain('"rate_cards"."unit_price_cents" >')
    expect(cardsWhere).toContain('"rate_cards"."effective_from" <=')
    const vendorsWhere = new PgDialect().sqlToQuery(wheres[1]!).sql
    expect(vendorsWhere).toContain('"vendors"."tenant_id" = $1')
  })

  it('leaves a line uncovered when the cheapest card has no vendor (PO skips the unassigned bucket)', async () => {
    const { executor, select } = executorReturning(
      [card({ id: 'card-a', vendorId: null, unitPriceCents: 9_000 }), card({ id: 'card-b' })],
      [VENDOR_ID]
    )
    const isContracted = await loadRateCardCoverage(executor, TENANT_ID, ['MAT-001'], NOW)

    expect(isContracted({ code: 'MAT-001', unit: 'pcs' })).toBe(false)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('leaves a line uncovered when its card names a vendor the tenant does not have', async () => {
    const { executor } = executorReturning([card({})], [])
    const isContracted = await loadRateCardCoverage(executor, TENANT_ID, ['MAT-001'], NOW)

    expect(isContracted({ code: 'MAT-001', unit: 'pcs' })).toBe(false)
  })

  it('reads nothing when no line has a code', async () => {
    const { executor, select } = executorReturning([], [])
    const isContracted = await loadRateCardCoverage(executor, TENANT_ID, [], NOW)

    expect(isContracted({ code: 'MAT-001', unit: 'pcs' })).toBe(false)
    expect(select).not.toHaveBeenCalled()
  })
})
