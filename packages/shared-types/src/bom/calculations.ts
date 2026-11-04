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
