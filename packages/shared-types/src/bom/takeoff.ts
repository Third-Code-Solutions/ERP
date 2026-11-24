import { classifyBomLineKind } from './grain'
import { boqQuantityFromNumber, MAX_BOM_LINE_ITEM_QUANTITY, parseBoqQuantity } from './quantity'

// A row with no description is stored under this placeholder so it stays visible.
export const TAKEOFF_PLACEHOLDER_DESCRIPTION_PREFIX = 'Unresolved takeoff row '

export interface StructuredTakeoffRow {
  sourceRowKey: string
  description: string
  quantity: number | null
  unit: string
  division: string | null
  location: string | null
  itemNo: string | null
  notes: string | null
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

const RECOGNIZED_UOMS = new Set([
  'sqm',
  'm2',
  'sq.m',
  'm²',
  'cu.m',
  'm3',
  'm³',
  'lm',
  'lot',
  'pc',
  'pcs',
  'kg',
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

export interface TakeoffLineState {
  description: string
  // numeric(18,4) decimal string as stored on the line.
  quantity: string
  unit: string | null
  hasDivision: boolean
  parentLineItemId: string | null
  unitRateSource: string
}

/**
 * Whether an unresolved takeoff row's reason still holds for the line as it is
 * now. Only the line decides: a duplicated source key needs a person to confirm
 * the surviving row, so it never blocks once the row is saved.
 */
export function takeoffIssueStillApplies(code: string, line: TakeoffLineState): boolean {
  switch (code) {
    case 'EMPTY_DESCRIPTION':
      return (
        line.description.trim() === '' ||
        line.description.startsWith(TAKEOFF_PLACEHOLDER_DESCRIPTION_PREFIX)
      )
    case 'INVALID_QUANTITY': {
      const quantity = parseBoqQuantity(line.quantity)
      return quantity === null || quantity === '0'
    }
    case 'INVALID_UOM':
      return !RECOGNIZED_UOMS.has(normalizeUnit(line.unit ?? ''))
    case 'MISSING_DIVISION':
      return !line.hasDivision
    case 'NO_CATALOG_MATCH':
      return line.unitRateSource !== 'dupa'
    case 'MATERIAL_PARENT_REQUIRED':
      return (
        classifyBomLineKind(line.unit).kind === 'material_line' &&
        line.parentLineItemId === null
      )
    default:
      return false
  }
}
