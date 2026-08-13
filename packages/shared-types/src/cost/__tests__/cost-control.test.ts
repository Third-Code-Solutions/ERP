import { describe, expect, it } from 'vitest'
import { computeCostControlMetrics } from '../calculations'

describe('cost-control v1 math', () => {
  it('uses the higher of commitment and invoiced actual without double counting', () => {
    expect(
      computeCostControlMetrics({
        baselineCents: 1_000_000,
        committedCents: 700_000,
        actualCents: 250_000,
      })
    ).toEqual({
      forecastCents: 700_000,
      remainingCents: 300_000,
      varianceCents: -750_000,
    })
  })

  it('lets posted actuals drive the forecast after they exceed the PO', () => {
    expect(
      computeCostControlMetrics({
        baselineCents: 1_000_000,
        committedCents: 700_000,
        actualCents: 1_100_000,
      })
    ).toEqual({
      forecastCents: 1_100_000,
      remainingCents: -100_000,
      varianceCents: 100_000,
    })
  })
})
