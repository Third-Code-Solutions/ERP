// D-5: a BOQ quantity is PostgreSQL numeric(18,4). It travels as a decimal
// string and is multiplied as an integer scaled by 10^4, never as a float.

// The legacy integer `bom_line_items.quantity` is still dual-written as
// round(quantity_decimal) until the contract release drops it, so the cap
// stays at the PostgreSQL integer maximum.
export const MAX_BOM_LINE_ITEM_QUANTITY = 2_147_483_647

export const BOQ_QUANTITY_DECIMAL_PLACES = 4

const BOQ_QUANTITY_SCALE = 10n ** BigInt(BOQ_QUANTITY_DECIMAL_PLACES)
const MAX_SCALED_QUANTITY = BigInt(MAX_BOM_LINE_ITEM_QUANTITY) * BOQ_QUANTITY_SCALE
const QUANTITY_DECIMAL = /^(\d*)(?:\.(\d*))?$/
const MAX_QUANTITY_INPUT_LENGTH = 32
const MICROS_PER_SCALED_UNIT = 100n

function parseScaledQuantity(input: string): bigint | null {
  if (input.length > MAX_QUANTITY_INPUT_LENGTH) return null
  const match = QUANTITY_DECIMAL.exec(input.trim())
  const whole = match?.[1] ?? ''
  const fraction = match?.[2] ?? ''
  if (!match || (whole === '' && fraction === '')) return null
  if (fraction.length > BOQ_QUANTITY_DECIMAL_PLACES) return null
  const scaled =
    BigInt(whole || '0') * BOQ_QUANTITY_SCALE +
    BigInt(fraction.padEnd(BOQ_QUANTITY_DECIMAL_PLACES, '0'))
  return scaled > MAX_SCALED_QUANTITY ? null : scaled
}

function formatScaledQuantity(scaled: bigint): string {
  const whole = scaled / BOQ_QUANTITY_SCALE
  const fraction = String(scaled % BOQ_QUANTITY_SCALE)
    .padStart(BOQ_QUANTITY_DECIMAL_PLACES, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

/**
 * Exact decimal string -> canonical BOQ quantity ("12.50" -> "12.5"). Returns
 * null for anything that is not a plain non-negative decimal with at most 4
 * decimal places within the BOM range (signs, exponents, separators, empty).
 */
export function parseBoqQuantity(input: string): string | null {
  const scaled = parseScaledQuantity(input)
  return scaled === null ? null : formatScaledQuantity(scaled)
}

/**
 * JSON/spreadsheet number -> canonical BOQ quantity. String(n) is the shortest
 * round-trip decimal, so any value with at most 4 decimal places in range is
 * read exactly; anything finer (or an exponent form) is rejected, not rounded.
 */
export function boqQuantityFromNumber(value: number): string | null {
  return Number.isFinite(value) ? parseBoqQuantity(String(value)) : null
}

/** Quantity scaled by 10^4. Throws on a value parseBoqQuantity rejects. */
export function scaledBoqQuantity(quantity: string): bigint {
  const scaled = parseScaledQuantity(quantity)
  if (scaled === null) {
    throw new RangeError(
      'quantity must be a non-negative decimal with at most 4 decimal places',
    )
  }
  return scaled
}

/** BOQ quantity -> `po_line_items.quantity_micros` (10^6 scale), exact. */
export function boqQuantityToMicros(quantity: string): number {
  return Number(scaledBoqQuantity(quantity) * MICROS_PER_SCALED_UNIT)
}

/** Display form with en-PH digit grouping: "12345.5000" -> "12,345.5". */
export function formatBoqQuantity(quantity: string): string {
  const scaled = parseScaledQuantity(quantity)
  if (scaled === null) return quantity
  const [whole = '0', fraction] = formatScaledQuantity(scaled).split('.')
  const grouped = BigInt(whole).toLocaleString('en-PH')
  return fraction ? `${grouped}.${fraction}` : grouped
}
