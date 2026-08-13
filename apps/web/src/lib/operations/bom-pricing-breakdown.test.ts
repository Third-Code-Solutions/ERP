import { describe, expect, it } from 'vitest'
import { summarizeBomPricing } from './bom-pricing-breakdown'

describe('summarizeBomPricing', () => {
  it('uses persisted source and provenance instead of defaulting to zeros', () => {
    expect(
      summarizeBomPricing([
        { unit_cost_cents: 100, unit_rate_source: 'manual', notes: 'Cost from RAG' },
        { unit_cost_cents: 200, unit_rate_source: 'manual', notes: 'Cost from Catalog' },
        { unit_cost_cents: 300, unit_rate_source: 'dupa' },
        { unit_cost_cents: 400, unit_rate_source: 'client_boq' },
        { unit_cost_cents: 500, unit_rate_source: 'manual' },
        { unit_cost_cents: 0, unit_rate_source: 'manual', notes: 'No catalog match' },
      ]),
    ).toEqual({
      rag: 1,
      catalog: 1,
      manual: 1,
      dupa: 1,
      clientBoq: 1,
      unpriced: 1,
      total: 6,
    })
  })

  it('does not count an unpriced row as a priced source', () => {
    expect(
      summarizeBomPricing([
        { unit_cost_cents: 0, unit_rate_source: 'dupa' },
        { unit_cost_cents: 100, unit_rate_source: 'dupa' },
      ]),
    ).toMatchObject({ dupa: 1, unpriced: 1, total: 2 })
  })
})
