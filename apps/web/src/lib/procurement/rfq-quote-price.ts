/**
 * A supplier unit price typed in pesos, as integer centavos.
 *
 * A quote is evidence of a price, so a blank or zero price is refused rather
 * than logged as 0.00. Parsed from the text, never through floating point
 * (1.005 * 100 is not 100.5).
 */

export const UNIT_PRICE_REQUIRED_ERROR = 'Enter a unit price greater than 0.'
const UNIT_PRICE_FORMAT_ERROR =
  'Unit price must be an amount in pesos with at most two decimals, for example 125.50.'

export function parseUnitPriceCents(
  text: string
): { cents: number } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { error: UNIT_PRICE_REQUIRED_ERROR }
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!match) return { error: UNIT_PRICE_FORMAT_ERROR }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (cents <= 0) return { error: UNIT_PRICE_REQUIRED_ERROR }
  return { cents }
}
