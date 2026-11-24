/**
 * Whether a Purchase Order line can be received into stock, and why not.
 *
 * Mirrors the database receipt guard (guard_stock_receipt_line): the line needs
 * an active, stock-tracked item and a unit equal to that item's base unit.
 * Unit equivalence is tenant data (units and aliases), never guessed here.
 */

export interface PoLineStockLinkInput {
  materialItemId: string | null
  uomId: string | null
  itemCode: string | null
  itemActive: boolean | null
  itemTracked: boolean | null
  itemBaseUomId: string | null
  itemBaseUomCode: string | null
  uomCode: string | null
  uomActive: boolean | null
  /** False where the PO page hides the link control (cancelled PO, retired project): no link hint. */
  linkable: boolean
}

export interface PoLineStockReadiness {
  ready: boolean
  /** Plain-language reason a line cannot be received; null when ready. */
  reason: string | null
}

const NOT_READY = (reason: string): PoLineStockReadiness => ({
  ready: false,
  reason,
})

export function poLineStockReadiness(
  line: PoLineStockLinkInput
): PoLineStockReadiness {
  if (!line.materialItemId || !line.itemCode) {
    return NOT_READY(
      line.linkable
        ? 'Not linked to a stock item. Open the Purchase Order and link it.'
        : 'Not linked to a stock item.'
    )
  }
  if (!line.itemActive) {
    return NOT_READY(`Stock item ${line.itemCode} is inactive.`)
  }
  if (!line.itemTracked) {
    return NOT_READY(
      `Stock item ${line.itemCode} is not stock-tracked. Turn tracking on in Inventory setup.`
    )
  }
  if (!line.uomId || !line.uomCode) {
    return NOT_READY(
      line.linkable
        ? 'No unit of measure on the line. Open the Purchase Order and link the stock item to set it.'
        : 'No unit of measure on the line.'
    )
  }
  if (!line.uomActive) {
    return NOT_READY(`Unit ${line.uomCode} is inactive.`)
  }
  if (line.itemBaseUomId !== line.uomId) {
    const itemUnit = line.itemBaseUomCode ?? 'another unit'
    const fix = line.linkable
      ? `Link an item kept in ${line.uomCode}, or correct the item's unit in Inventory setup.`
      : "Correct the item's unit in Inventory setup."
    return NOT_READY(
      `The line is in ${line.uomCode} but stock item ${line.itemCode} is kept in ${itemUnit}. ${fix}`
    )
  }
  return { ready: true, reason: null }
}

export type PoLineUomDecision = { uomId: string } | { error: string }

/**
 * The unit a PO line takes when it is linked to a stock item.
 *
 * A unit the line already has (set, or found by UOM code or alias) must be the
 * item's base unit: a different one means different goods, never a silent
 * conversion. Only a line with no unit text takes the item's unit.
 */
export function uomForLinkedItem(input: {
  lineUnit: string | null
  lineUomId: string | null
  resolvedUomId: string | null
  itemBaseUomId: string
  itemCode: string
}): PoLineUomDecision {
  const unitText = input.lineUnit?.trim() ?? ''
  const current = input.lineUomId ?? input.resolvedUomId
  if (current) {
    if (current === input.itemBaseUomId) return { uomId: current }
    return {
      error: `The line unit "${unitText}" is not the unit stock item ${input.itemCode} is kept in. Pick an item kept in the line's unit, or correct the item's unit in Inventory setup.`,
    }
  }
  if (unitText === '') return { uomId: input.itemBaseUomId }
  return {
    error: `The line unit "${unitText}" is not a known unit of measure. Add it under Inventory setup first.`,
  }
}

/** The unit a new stock item takes from the line it is created from. */
export function uomForNewItem(input: {
  lineUnit: string | null
  lineUomId: string | null
  resolvedUomId: string | null
}): PoLineUomDecision {
  const uomId = input.lineUomId ?? input.resolvedUomId
  if (uomId) return { uomId }
  const unitText = input.lineUnit?.trim() ?? ''
  return {
    error: unitText
      ? `The line unit "${unitText}" is not a known unit of measure. Add it under Inventory setup first.`
      : 'The line has no unit. Pick an existing stock item instead.',
  }
}
