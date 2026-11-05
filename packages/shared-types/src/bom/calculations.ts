// Pure BOM calculation functions using integer arithmetic.
// All monetary values are in PHP centavos (integer).
// Percentages/markups use basis points: 0-10000 = 0%-100%.

import { scaledBoqQuantity } from './quantity'
import { TAX_DEFAULTS, type EffectiveTaxRates } from '../tax-rates'

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
  // D-5: numeric(18,4) decimal string.
  quantity: string
  markup_bps: BasisPoints
  line_total_cents: number
}

/**
 * Return the commercial BOM spine. Attached material rows are preserved in
 * the BOM, but their cost is represented by the top-level work item.
 */
export function topLevelBomLines<TLine>(
  lines: ReadonlyArray<TLine>,
  getParentLineItemId: (line: TLine) => string | null,
): TLine[] {
  return lines.filter((line) => getParentLineItemId(line) === null)
}

export interface BomLineHierarchyRow {
  id: string
  is_group: number
  parent_id: string | null
  parent_line_item_id: string | null
}

/**
 * Return the BOM rows a Purchase Order buys: the leaves. A row other rows hang
 * under (a work item with material lines, or a section) is represented by its
 * children, and group headers are never bought, so no cost is counted twice.
 */
export function purchasableBomLines<TLine extends BomLineHierarchyRow>(
  lines: ReadonlyArray<TLine>,
): TLine[] {
  const parentIds = new Set(
    lines.flatMap((line) => [line.parent_id, line.parent_line_item_id]),
  )
  return lines.filter((line) => line.is_group === 0 && !parentIds.has(line.id))
}

/**
 * Cost code for a purchased BOM line. Material lines have no budget line of
 * their own, so they carry the code of the budgeted work item they hang under.
 *
 * shortcut: only the cost code rolls up. The PO line keeps the material row's
 * own bom_line_item_id, but budget lines exist only for top-level rows, so the
 * WO-15 block-mode trigger and the cost-control per-line join do not roll the
 * material line up to its parent. Follow-up: resolve them via
 * parent_line_item_id.
 */
export function purchaseLineCostCode<TCode>(
  costCodeByBomLine: ReadonlyMap<string, TCode>,
  line: Pick<BomLineHierarchyRow, 'id' | 'parent_line_item_id'>,
): TCode | undefined {
  return (
    costCodeByBomLine.get(line.id) ??
    (line.parent_line_item_id
      ? costCodeByBomLine.get(line.parent_line_item_id)
      : undefined)
  )
}

export interface RateCardOffer {
  id: string
  code: string | null
  // Unit of the card's material item.
  unit: string | null
  vendorId: string | null
  unitPriceCents: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

/** Units match when equal after trimming, ignoring case. A blank unit never matches. */
export function sameUnitOfMeasure(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalized = left?.trim().toLowerCase() ?? ''
  return normalized !== '' && normalized === (right?.trim().toLowerCase() ?? '')
}

/**
 * Index rate cards for PO pricing. The returned function gives the cheapest
 * usable card for a BOM line's material code and unit; ties go to the lowest
 * card id. A card is usable only with a positive price, inside its effective
 * window at `now`, and with a vendor that is null or listed in `vendorIds`.
 */
export function rateCardPicker<TCard extends RateCardOffer>(
  cards: ReadonlyArray<TCard>,
  vendorIds: ReadonlySet<string>,
  now: Date,
): (line: { code: string | null; unit: string | null }) => TCard | undefined {
  const cardsByCode = new Map<string, TCard[]>()
  for (const card of cards) {
    if (!card.code || card.unitPriceCents <= 0) continue
    if (card.effectiveFrom > now || (card.effectiveTo && card.effectiveTo <= now)) continue
    if (card.vendorId && !vendorIds.has(card.vendorId)) continue
    const sameCode = cardsByCode.get(card.code)
    if (sameCode) sameCode.push(card)
    else cardsByCode.set(card.code, [card])
  }

  return (line) => {
    let best: TCard | undefined
    for (const card of (line.code && cardsByCode.get(line.code)) || []) {
      if (!sameUnitOfMeasure(card.unit, line.unit)) continue
      if (
        !best ||
        card.unitPriceCents < best.unitPriceCents ||
        (card.unitPriceCents === best.unitPriceCents && card.id < best.id)
      ) {
        best = card
      }
    }
    return best
  }
}

// line_total = unit_cost * quantity * (1 + markup_bps / 10000)
// D-5: quantity is an exact decimal string (at most 4 dp), and the whole
// product is rounded half-up once, to the centavo.
export function lineTotal(
  unitCostCents: number,
  quantity: string,
  markupBps: BasisPoints
): number {
  const unitCost = exactInteger(unitCostCents, 'unit cost')
  const scaledQuantity = scaledBoqQuantity(quantity)
  const markupRate = exactInteger(markupBps, 'markup basis points')
  return safeNumber(
    roundHalfUp(
      unitCost * scaledQuantity * (10000n + markupRate),
      10000n * 10000n
    ),
    'line total'
  )
}

// Manual BOM lines do not accept an ad-hoc line-level markup. Client pricing
// is supplied by the attached rate source and approved through the pricing
// workflow, so manual input is always a flat cost calculation.
export function manualLineTotal(unitCostCents: number, quantity: string): number {
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

export interface BomTotalsLine {
  unit_cost_cents: number
  // D-5: numeric(18,4) decimal string.
  quantity: string
  line_total_cents: number
  parent_line_item_id: string | null
}

/**
 * The stored BOM totals: top-level lines only, cost without markup, TCV as
 * the sum of line totals. Same formula as Web recalcBomTotalsInTransaction.
 */
export function computeBomTotals(lines: ReadonlyArray<BomTotalsLine>) {
  const commercialLines = topLevelBomLines(lines, (line) => line.parent_line_item_id)
  const total_cost_cents = bomTotalCost(
    commercialLines.map((line) => ({
      line_total_cents: manualLineTotal(line.unit_cost_cents, line.quantity),
    }))
  )
  const tcv_cents = bomTotalCost(commercialLines)
  const gp_cents = computeGP(tcv_cents, total_cost_cents)
  return {
    total_cost_cents,
    tcv_cents,
    gp_cents,
    gp_margin_bps: computeGPMargin(gp_cents, tcv_cents),
  }
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

// VAT at the tenant's effective rate (default: TAX_DEFAULTS)
export function computeVAT(
  amountCents: number,
  vatBps: BasisPoints = TAX_DEFAULTS.vatBps
): number {
  return roundedRatio(amountCents, vatBps, 10000, 'VAT')
}

// Expanded withholding tax (BIR EWT) at the effective rate
export function computeEWT(
  amountCents: number,
  ewtBps: BasisPoints = TAX_DEFAULTS.ewtBps
): number {
  return roundedRatio(amountCents, ewtBps, 10000, 'EWT')
}

// Retention at the effective rate (standard Philippine construction billing)
export function computeRetention(
  amountCents: number,
  retentionBps: BasisPoints = TAX_DEFAULTS.retentionBps
): number {
  return roundedRatio(amountCents, retentionBps, 10000, 'retention')
}

/**
 * Spec tenancy C-2, the one progress-invoice formula used by the Core API
 * draft, the legacy web draft and the invoice form preview. VAT and EWT are
 * taken on (subtotal - retention); a non-VAT tenant charges no output VAT.
 */
export function computeProgressInvoice(
  tcvCents: number,
  billingPercentBps: BasisPoints,
  rates: Pick<EffectiveTaxRates, 'vatBps' | 'ewtBps' | 'retentionBps' | 'vatRegistered'>
) {
  const subtotal = progressBillingAmount(tcvCents, billingPercentBps)
  const retention = computeRetention(subtotal, rates.retentionBps)
  const base = subtotal - retention
  const vatBps = rates.vatRegistered ? rates.vatBps : 0
  const vat = computeVAT(base, vatBps)
  const ewt = computeEWT(base, rates.ewtBps)
  return { subtotal, retention, base, vat, ewt, net: base + vat - ewt, vatBps }
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

const PERCENT_DECIMAL = /^(\d*)(?:\.(\d*))?$/
const MAX_PERCENT_INPUT_LENGTH = 32

// D-15: exact decimal-string percent -> basis points, half-up at the bps
// level ("12.345" -> 1235). Returns null for anything that is not a plain
// non-negative decimal (signs, exponents, separators, empty input).
export function parsePercentToBps(input: string): BasisPoints | null {
  if (input.length > MAX_PERCENT_INPUT_LENGTH) return null
  const match = PERCENT_DECIMAL.exec(input.trim())
  const whole = match?.[1] ?? ''
  const fraction = match?.[2] ?? ''
  if (!match || (whole === '' && fraction === '')) return null
  const bps =
    BigInt(whole || '0') * 100n +
    BigInt(fraction.slice(0, 2).padEnd(2, '0')) +
    (fraction.charAt(2) >= '5' ? 1n : 0n)
  return bps > MAX_SAFE_INTEGER_BIGINT ? null : Number(bps)
}

const FULL_CONTRACT_BPS = 10_000n

function formatBpsAsPercent(bps: bigint): string {
  return `${bps / 100n}.${String(bps % 100n).padStart(2, '0')}%`
}

// D-6: the progress invoices of one contract may never bill more than 100%
// of it. Returns the rejection message, or null when the new bill fits.
export function cumulativeBillingCapError(
  billedPercentBps: BasisPoints,
  billingPercentBps: BasisPoints
): string | null {
  const billed = exactInteger(billedPercentBps, 'billed percent basis points')
  const billing = exactInteger(billingPercentBps, 'billing percent basis points')
  if (billed + billing <= FULL_CONTRACT_BPS) return null
  const remaining = billed >= FULL_CONTRACT_BPS ? 0n : FULL_CONTRACT_BPS - billed
  return `Cumulative progress billing cannot exceed 100% of the contract: ${formatBpsAsPercent(billed)} already billed, ${formatBpsAsPercent(remaining)} remaining.`
}
