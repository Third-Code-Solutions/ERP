/** Basis points as a percent label that keeps fractions: 1250 → "12.5", 1000 → "10". */
export function bpsToPercentLabel(bps: number): string {
  return (bps / 100).toLocaleString('en-PH', { maximumFractionDigits: 2, useGrouping: false })
}
