import { and, eq, inArray } from 'drizzle-orm'
import { rateCardPicker } from '@third-code-erp/shared-types/bom'
import type { Database } from '../client'
import { materialItems, rateCards, vendors } from '../schema'
import { rateCardInEffectCondition } from './rate-card-in-effect'

export type RateCardCoveredLine = { code: string | null; unit: string | null }

/**
 * RFQ coverage. A BOM line is "contracted", and so left out of an RFQ, exactly
 * when PO creation would price it from a rate card: `rateCardPicker` picks a
 * card (in effect, priced, known vendor, same unit) and that card names a
 * vendor. PO creation sends a picked card without a vendor to the unassigned
 * bucket, which it skips, so such a line still needs a quote.
 */
export async function loadRateCardCoverage(
  executor: Pick<Database, 'select'>,
  tenantId: string,
  codes: readonly string[],
  now: Date
): Promise<(line: RateCardCoveredLine) => boolean> {
  if (codes.length === 0) return () => false

  const cards = await executor
    .select({
      id: rateCards.id,
      code: materialItems.code,
      unit: materialItems.unit,
      vendorId: rateCards.vendor_id,
      unitPriceCents: rateCards.unit_price_cents,
      effectiveFrom: rateCards.effective_from,
      effectiveTo: rateCards.effective_to,
    })
    .from(rateCards)
    .innerJoin(
      materialItems,
      and(
        eq(rateCards.material_item_id, materialItems.id),
        eq(materialItems.tenant_id, tenantId)
      )
    )
    .where(
      and(
        eq(rateCards.tenant_id, tenantId),
        inArray(materialItems.code, [...codes]),
        rateCardInEffectCondition(now)
      )
    )

  const candidateVendorIds = [
    ...new Set(cards.flatMap((card) => (card.vendorId ? [card.vendorId] : []))),
  ]
  const knownVendors =
    candidateVendorIds.length === 0
      ? []
      : await executor
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.tenant_id, tenantId), inArray(vendors.id, candidateVendorIds)))

  const pick = rateCardPicker(cards, new Set(knownVendors.map((vendor) => vendor.id)), now)
  return (line) => Boolean(pick(line)?.vendorId)
}
