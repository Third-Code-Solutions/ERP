import { parsePesosToCents } from '@/lib/operations/scope-money'

/**
 * A supplier unit price typed in pesos, as integer centavos.
 *
 * A quote is evidence of a price, so a blank or zero price is refused rather
 * than logged as 0.00. Parsing is the shared peso parser (text, never floats).
 */

export const UNIT_PRICE_REQUIRED_ERROR = 'Enter a unit price greater than 0.'
export const UNIT_PRICE_FORMAT_ERROR =
  'Unit price must be an amount in pesos with at most two decimals, for example 125.50.'

export function parseUnitPriceCents(
  text: string
): { cents: number } | { error: string } {
  if (text.trim() === '') return { error: UNIT_PRICE_REQUIRED_ERROR }
  const cents = parsePesosToCents(text)
  if (cents === undefined) return { error: UNIT_PRICE_FORMAT_ERROR }
  if (cents <= 0) return { error: UNIT_PRICE_REQUIRED_ERROR }
  return { cents }
}
