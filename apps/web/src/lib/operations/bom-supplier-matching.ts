export interface CanonicalSupplierPrice {
  id: string
  vendor_id: string | null
  vendor_name: string | null
  quoted_rate_centavos: bigint | number | string
  awarded_rate_centavos: bigint | number | string | null
  source_type: string
  occurred_at: string
}

export interface CanonicalSupplierOption {
  id: string
  vendor_id: string
  vendor_name: string | null
  unit_price_cents: number
  lead_time_days: null
  is_preferred: boolean
  effective_from: Date
  source_type: string
  occurred_at: string
  is_stale: boolean
}

export const PRICE_STALE_AFTER_DAYS = 90

export function isPriceHistoryStale(
  occurredAt: string,
  now = new Date(),
): boolean {
  const occurred = new Date(`${occurredAt}T00:00:00.000Z`)
  if (Number.isNaN(occurred.getTime())) return true
  const ageMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - occurred.getTime()
  return ageMs > PRICE_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Convert canonical price history rows into one current option per vendor.
 * The database query orders newest first, so the first row wins. Keeping this
 * policy pure makes supplier identity and award-price precedence testable
 * without a database or a UI render.
 */
export function selectCanonicalSupplierOptions(
  rows: ReadonlyArray<CanonicalSupplierPrice>,
  now = new Date(),
): CanonicalSupplierOption[] {
  const seenVendors = new Set<string>()
  const options: CanonicalSupplierOption[] = []

  for (const row of rows) {
    if (!row.vendor_id || seenVendors.has(row.vendor_id)) continue
    seenVendors.add(row.vendor_id)
    const unitPrice = row.awarded_rate_centavos ?? row.quoted_rate_centavos
    options.push({
      id: row.id,
      vendor_id: row.vendor_id,
      vendor_name: row.vendor_name,
      unit_price_cents: Number(unitPrice),
      lead_time_days: null,
      is_preferred: row.source_type === 'award',
      effective_from: new Date(`${row.occurred_at}T00:00:00.000Z`),
      source_type: row.source_type,
      occurred_at: row.occurred_at,
      is_stale: isPriceHistoryStale(row.occurred_at, now),
    })
  }

  return options
}
