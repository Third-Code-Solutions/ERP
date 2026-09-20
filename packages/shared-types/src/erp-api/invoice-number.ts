/**
 * Build the next invoice number from a database-derived numeric suffix.
 *
 * Invoice numbers are presentation identifiers, but allocation is a money
 * workflow boundary: never coerce the suffix through JavaScript Number because
 * a long-running tenant can exceed the safe-integer range. The database query
 * returns the validated suffix as text and this helper advances it exactly.
 */
export function nextInvoiceNumber(prefix: string, highestSuffix: string | null | undefined): string {
  const normalizedPrefix = prefix.trim()
  if (normalizedPrefix.length === 0) {
    throw new Error('Invoice prefix is required')
  }

  const normalizedSuffix = highestSuffix?.trim() ?? ''
  const highest = /^\d+$/.test(normalizedSuffix) ? BigInt(normalizedSuffix) : 0n
  return `${normalizedPrefix}${(highest + 1n).toString().padStart(3, '0')}`
}
