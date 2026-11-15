import { and, gt, isNull, lte, or, type SQL } from 'drizzle-orm'
import { rateCards } from '../schema/bom-extras'

/**
 * A rate card that can price a line at `now`: inside its effective window and
 * priced above 0 centavos. This is the SQL half of `rateCardPicker`
 * (shared-types), shared by PO pricing and by RFQ "contracted line" selection,
 * so a line is left out of an RFQ only when a rate card can actually price it.
 */
export function rateCardInEffectCondition(now: Date): SQL | undefined {
  return and(
    lte(rateCards.effective_from, now),
    or(isNull(rateCards.effective_to), gt(rateCards.effective_to, now)),
    gt(rateCards.unit_price_cents, 0)
  )
}
