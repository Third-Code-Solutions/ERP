import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { rateCardInEffectCondition } from './rate-card-in-effect'

describe('rate card in effect', () => {
  it('requires the effective window to cover now and a price above 0 centavos', () => {
    const now = new Date('2026-11-15T00:00:00.000Z')
    const condition = rateCardInEffectCondition(now)
    if (!condition) throw new Error('Missing rate-card condition')
    const query = new PgDialect().sqlToQuery(condition)

    expect(query.sql).toBe(
      '("rate_cards"."effective_from" <= $1 and ("rate_cards"."effective_to" is null or "rate_cards"."effective_to" > $2) and "rate_cards"."unit_price_cents" > $3)'
    )
    expect(query.params).toEqual([now.toISOString(), now.toISOString(), 0])
  })
})
