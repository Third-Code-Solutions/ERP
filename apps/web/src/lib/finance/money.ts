/** Integer centavos to a plain "1234.50" peso string. Integer math only; no float division of money. */
export function centavosToPesos(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Amount must be a safe integer number of centavos')
  }
  const absolute = Math.abs(cents)
  const fraction = absolute % 100
  const whole = (absolute - fraction) / 100
  return `${cents < 0 ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`
}

/** Database aggregates (sum of bigint) arrive as numeric strings; refuse anything that is not a whole centavo. */
export function toCents(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  const cents = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Amount is not a safe integer number of centavos')
  }
  return cents
}
