// Pure BOM calculation functions using integer arithmetic.
// All monetary values are in PHP centavos (integer).
// Percentages/markups use basis points: 0-10000 = 0%-100%.

export type BasisPoints = number

export interface BomLine {
  unit_cost_cents: number
  quantity: number
  markup_bps: BasisPoints
  line_total_cents: number
}

// line_total = unit_cost * quantity * (1 + markup_bps / 10000)
export function lineTotal(
  unitCostCents: number,
  quantity: number,
  markupBps: BasisPoints
): number {
  const subtotal = unitCostCents * quantity
  const markup = Math.round((subtotal * markupBps) / 10000)
  return subtotal + markup
}

// Manual BOM lines do not accept an ad-hoc line-level markup. Client pricing
// is supplied by the attached rate source and approved through the pricing
// workflow, so manual input is always a flat cost calculation.
export function manualLineTotal(unitCostCents: number, quantity: number): number {
  return lineTotal(unitCostCents, quantity, 0)
}

// Sum of all line totals
export function bomTotalCost(lines: { line_total_cents: number }[]): number {
  return lines.reduce((sum, line) => sum + line.line_total_cents, 0)
}

// TCV = cost / (1 - margin)
// marginBps: gross profit margin as basis points (e.g. 2000 = 20%)
export function computeTCV(costCents: number, marginBps: BasisPoints): number {
  if (marginBps >= 10000) throw new Error('marginBps must be less than 10000 (100%)')
  if (marginBps < 0) throw new Error('marginBps must be >= 0')
  if (costCents === 0) return 0
  const denominator = 10000 - marginBps
  return Math.round((costCents * 10000) / denominator)
}

// GP = TCV - cost
export function computeGP(tcvCents: number, costCents: number): number {
  return tcvCents - costCents
}

// GP margin in basis points = (GP / TCV) * 10000
export function computeGPMargin(gpCents: number, tcvCents: number): BasisPoints {
  if (tcvCents === 0) return 0
  return Math.round((gpCents * 10000) / tcvCents)
}

// Weighted TCV = TCV * probability / 100
export function weightedTCV(tcvCents: number, probabilityPercent: number): number {
  return Math.round((tcvCents * probabilityPercent) / 100)
}

// 12% VAT (Philippine standard)
export function computeVAT(amountCents: number): number {
  return Math.round(amountCents * 0.12)
}

// 2% expanded withholding tax (BIR EWT)
export function computeEWT(amountCents: number): number {
  return Math.round(amountCents * 0.02)
}

// 10% retention (standard Philippine construction billing)
export function computeRetention(amountCents: number, retentionBps = 1000): number {
  return Math.round((amountCents * retentionBps) / 10000)
}

// Progress billing amount for a given billing percent
export function progressBillingAmount(
  contractCents: number,
  billingPercentBps: BasisPoints
): number {
  return Math.round((contractCents * billingPercentBps) / 10000)
}
