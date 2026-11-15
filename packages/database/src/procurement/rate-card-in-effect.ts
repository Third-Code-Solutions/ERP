import { and, gt, isNull, lte, or, type SQL } from 'drizzle-orm'
import { rateCards } from '../schema/bom-extras'

/**
 * A rate card in effect at `now`: inside its effective window and priced above
 * 0 centavos. This is the SQL half of `rateCardPicker` (shared-types), shared
 * by PO pricing and RFQ "contracted line" selection. The picker's vendor and
 * unit checks are not part of it.
 */
export function rateCardInEffectCondition(now: Date): SQL | undefined {
  return and(
    lte(rateCards.effective_from, now),
    or(isNull(rateCards.effective_to), gt(rateCards.effective_to, now)),
    gt(rateCards.unit_price_cents, 0)
  )
}
