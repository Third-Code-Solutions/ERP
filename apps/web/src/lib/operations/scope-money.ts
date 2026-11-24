/** Parse user-entered peso text without routing money through IEEE-754 floats. */
export function parsePesosToCents(raw: string): number | undefined {
  const value = raw.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined

  const [whole = '0', fraction = ''] = value.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  const result = Number(cents)
  return Number.isSafeInteger(result) ? result : undefined
}

// PHP 1,000,000,000 in centavos: the cap every opportunity writer uses.
export const MAX_OPPORTUNITY_CENTS = 100_000_000_000

/**
 * Opportunity TCV/GP form text as centavos. Blank means 0; otherwise exact
 * pesos (no float math) up to the opportunity cap, or undefined when invalid.
 * GP may be negative (a loss-making deal), matching Core's signed GP schema.
 */
export function parseOpportunityCents(
  value: FormDataEntryValue | null,
  { signed = false }: { signed?: boolean } = {}
): number | undefined {
  if (value === null) return 0
  if (typeof value !== 'string' || value.length > 32) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return 0
  const negative = signed && trimmed.startsWith('-')
  const cents = parsePesosToCents(negative ? trimmed.slice(1) : trimmed)
  if (cents === undefined || cents > MAX_OPPORTUNITY_CENTS) return undefined
  return negative && cents > 0 ? -cents : cents
}

export function multiplyCents(
  unitCostCents: number,
  quantity: number
): number | undefined {
  if (
    !Number.isSafeInteger(unitCostCents) ||
    unitCostCents < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0
  ) {
    return undefined
  }

  const result = Number(BigInt(unitCostCents) * BigInt(quantity))
  return Number.isSafeInteger(result) ? result : undefined
}
