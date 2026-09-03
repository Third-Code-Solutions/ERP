/** Preserve BIGINT centavos through aggregation and presentation. */
export function formatReportMoney(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents
  return `${cents < 0n ? '-' : ''}₱${(absolute / 100n).toLocaleString('en-PH')}.${(absolute % 100n).toString().padStart(2, '0')}`
}

export function formatReportMargin(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '—'
  const negative = (numerator < 0n) !== (denominator < 0n)
  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  const absoluteDenominator = denominator < 0n ? -denominator : denominator
  const tenths = (absoluteNumerator * 1000n + absoluteDenominator / 2n) / absoluteDenominator
  return `${negative && tenths !== 0n ? '-' : ''}${tenths / 10n}.${tenths % 10n}%`
}
