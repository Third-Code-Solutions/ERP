import { lineTotal } from './calculations'
import { boqQuantityFromNumber, MAX_BOM_LINE_ITEM_QUANTITY } from './quantity'

export interface StructuredTakeoffRow {
  sourceRowKey: string
  description: string
  quantity: number | null
  unit: string
  division: string | null
  location: string | null
  itemNo: string | null
  // The line's code when the file has a Code column; absent: the item number is used.
  code?: string | null
  notes: string | null
  // Client BOQ rate in centavos. Absent: no rate; null: the cell was unreadable.
  unitRateCentavos?: number | null
  raw: Record<string, string | number | null>
}

export type TakeoffValidationCode =
  | 'DUPLICATE_SOURCE_ROW_KEY'
  | 'EMPTY_DESCRIPTION'
  | 'INVALID_QUANTITY'
  | 'INVALID_UOM'
  | 'MISSING_DIVISION'
  | 'NO_CATALOG_MATCH'
  | 'MATERIAL_PARENT_REQUIRED'
  | 'INVALID_UNIT_RATE'

export interface TakeoffValidationIssue {
  sourceRowKey: string
  code: TakeoffValidationCode
  message: string
}

// D-5: `bom_line_items.quantity_decimal` is numeric(18,4). A value with more
// than 4 decimal places is never rounded to fit: it commits as 0 and the
// unresolved queue surfaces the row (validateTakeoffRows flags it).
export function takeoffCommitQuantity(quantity: number | null): string {
  if (quantity === null || quantity <= 0) return '0'
  return boqQuantityFromNumber(quantity) ?? '0'
}

export interface TakeoffCommitPricing {
  unitCostCents: number
  lineTotalCents: number
  unitRateSource: 'manual' | 'client_boq'
}

const UNPRICED: TakeoffCommitPricing = {
  unitCostCents: 0,
  lineTotalCents: 0,
  unitRateSource: 'manual',
}

// PHP 10 billion per imported line: a full 5,000-row import at the cap still
// sums below 2^53, so computeBomTotals stays exact for the rows it commits.
export const TAKEOFF_MAX_LINE_TOTAL_CENTAVOS = 1_000_000_000_000

function pricedLineTotal(unitRateCentavos: number, quantity: number | null): number | null {
  try {
    const total = lineTotal(unitRateCentavos, takeoffCommitQuantity(quantity), 0)
    return total > TAKEOFF_MAX_LINE_TOTAL_CENTAVOS ? null : total
  } catch {
    return null
  }
}

// boq-export A.4: a readable client rate prices the line; anything else stays
// unpriced (and validateTakeoffRows queues an unreadable or overflowing rate).
export function takeoffCommitPricing(
  row: Pick<StructuredTakeoffRow, 'quantity' | 'unitRateCentavos'>,
): TakeoffCommitPricing {
  if (row.unitRateCentavos == null) return UNPRICED
  const lineTotalCents = pricedLineTotal(row.unitRateCentavos, row.quantity)
  return lineTotalCents === null
    ? UNPRICED
    : { unitCostCents: row.unitRateCentavos, lineTotalCents, unitRateSource: 'client_boq' }
}

const RECOGNIZED_UOMS = new Set([
  'sqm',
  'm2',
  'sq.m',
  'm²',
  'cu.m',
  'm3',
  'm³',
  'lm',
  'm',
  'lot',
  'ls',
  'l.s.',
  'l.s',
  'lump sum',
  'lumpsum',
  'pc',
  'pcs',
  'ea',
  'each',
  'no.',
  'no',
  'nos',
  'unit',
  'units',
  'kg',
  'bag',
  'bags',
  'box',
  'liter',
  'liters',
  'l',
  'set',
])

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function validateTakeoffRows(
  rows: ReadonlyArray<StructuredTakeoffRow>,
): TakeoffValidationIssue[] {
  const issues: TakeoffValidationIssue[] = []
  const seenKeys = new Set<string>()

  for (const row of rows) {
    if (seenKeys.has(row.sourceRowKey)) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'DUPLICATE_SOURCE_ROW_KEY',
        message: 'Source row key is duplicated in this import.',
      })
    } else {
      seenKeys.add(row.sourceRowKey)
    }

    if (!row.description) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'EMPTY_DESCRIPTION',
        message: 'Description is required.',
      })
    }
    if (row.quantity == null || row.quantity <= 0) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be greater than zero.',
      })
    } else if (boqQuantityFromNumber(row.quantity) === null) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_QUANTITY',
        message: `Quantity must have at most 4 decimal places and not exceed ${MAX_BOM_LINE_ITEM_QUANTITY.toLocaleString('en-PH')}.`,
      })
    }

    const unit = normalizeUnit(row.unit)
    if (!RECOGNIZED_UOMS.has(unit)) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_UOM',
        message: `UOM "${row.unit}" is not recognized.`,
      })
    }
    if (row.unitRateCentavos === null) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_UNIT_RATE',
        message: 'Unit rate could not be read as a non-negative peso amount.',
      })
    } else if (
      row.unitRateCentavos !== undefined &&
      pricedLineTotal(row.unitRateCentavos, row.quantity) === null
    ) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_UNIT_RATE',
        message: 'Quantity x unit rate exceeds the supported amount range.',
      })
    }
    if (!row.division) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'MISSING_DIVISION',
        message: 'Division is required before import.',
      })
    }
  }

  return issues
}
