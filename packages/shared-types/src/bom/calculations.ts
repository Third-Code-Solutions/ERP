// Pure BOM calculation functions using integer arithmetic.
// All monetary values are in PHP centavos (integer).
// Percentages/markups use basis points: 0-10000 = 0%-100%.

export type BasisPoints = number

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER)

function exactInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
  return BigInt(value)
}

function safeNumber(value: bigint, label: string): number {
  if (
    value < MIN_SAFE_INTEGER_BIGINT ||
    value > MAX_SAFE_INTEGER_BIGINT
  ) {
    throw new RangeError(`${label} exceeds the exact number range`)
  }
  return Number(value)
}

/**
 * Round a rational amount half-up without converting the monetary numerator
 * through a JavaScript floating point number.
 */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError('Ratio denominator must not be zero')
  }

  const product = numerator
  const sign =
    (product < 0n) === (denominator < 0n) ? 1n : -1n
  const absoluteProduct = product < 0n ? -product : product
  const absoluteDenominator =
    denominator < 0n ? -denominator : denominator
  return sign *
    ((absoluteProduct * 2n + absoluteDenominator) /
      (absoluteDenominator * 2n))
}

function roundedRatio(
  value: number,
  numerator: number,
  denominator: number,
  label: string
): number {
  const valueBigInt = exactInteger(value, label)
  const numeratorBigInt = exactInteger(numerator, `${label} numerator`)
  const denominatorBigInt = exactInteger(denominator, `${label} denominator`)

  return safeNumber(
    roundHalfUp(valueBigInt * numeratorBigInt, denominatorBigInt),
    label
  )
}

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
  const unitCost = exactInteger(unitCostCents, 'unit cost')
  const quantityBigInt = exactInteger(quantity, 'quantity')
  const markupRate = exactInteger(markupBps, 'markup basis points')
  const subtotal = unitCost * quantityBigInt
  const markup = roundHalfUp(subtotal * markupRate, 10000n)
  return safeNumber(subtotal + markup, 'line total')
}

// Manual BOM lines do not accept an ad-hoc line-level markup. Client pricing
// is supplied by the attached rate source and approved through the pricing
// workflow, so manual input is always a flat cost calculation.
export function manualLineTotal(unitCostCents: number, quantity: number): number {
  return lineTotal(unitCostCents, quantity, 0)
}

// Sum of all line totals
export function bomTotalCost(lines: { line_total_cents: number }[]): number {
  const total = lines.reduce(
    (sum, line) => sum + exactInteger(line.line_total_cents, 'line total'),
    0n
  )
  return safeNumber(total, 'BOM total cost')
}

// TCV = cost / (1 - margin)
// marginBps: gross profit margin as basis points (e.g. 2000 = 20%)
export function computeTCV(costCents: number, marginBps: BasisPoints): number {
  if (marginBps >= 10000) throw new Error('marginBps must be less than 10000 (100%)')
  if (marginBps < 0) throw new Error('marginBps must be >= 0')
  if (costCents === 0) return 0
  const denominator = 10000 - marginBps
  return roundedRatio(costCents, 10000, denominator, 'TCV')
}

// GP = TCV - cost
export function computeGP(tcvCents: number, costCents: number): number {
  return safeNumber(
    exactInteger(tcvCents, 'TCV') - exactInteger(costCents, 'cost'),
    'gross profit'
  )
}

// GP margin in basis points = (GP / TCV) * 10000
export function computeGPMargin(gpCents: number, tcvCents: number): BasisPoints {
  if (tcvCents === 0) return 0
  return roundedRatio(gpCents, 10000, tcvCents, 'gross profit margin')
}

// Weighted TCV = TCV * probability / 100
export function weightedTCV(tcvCents: number, probabilityPercent: number): number {
  return roundedRatio(tcvCents, probabilityPercent, 100, 'weighted TCV')
}

// 12% VAT (Philippine standard)
export function computeVAT(amountCents: number): number {
  return roundedRatio(amountCents, 1200, 10000, 'VAT')
}

// 2% expanded withholding tax (BIR EWT)
export function computeEWT(amountCents: number): number {
  return roundedRatio(amountCents, 200, 10000, 'EWT')
}

// 10% retention (standard Philippine construction billing)
export function computeRetention(amountCents: number, retentionBps = 1000): number {
  return roundedRatio(amountCents, retentionBps, 10000, 'retention')
}

// Progress billing amount for a given billing percent
export function progressBillingAmount(
  contractCents: number,
  billingPercentBps: BasisPoints
): number {
  return roundedRatio(
    contractCents,
    billingPercentBps,
    10000,
    'progress billing amount'
  )
}
