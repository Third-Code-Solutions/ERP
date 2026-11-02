import { bomQuantitySchema } from './quantity'
export { MAX_BOM_LINE_ITEM_QUANTITY } from './quantity'

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

export function takeoffCommitQuantity(quantity: number | null): number {
  if (
    quantity === null ||
    !bomQuantitySchema.safeParse(quantity).success ||
    quantity <= 0
  ) {
    return 0
  }
  return quantity
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
    } else if (!bomQuantitySchema.safeParse(row.quantity).success) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_QUANTITY',
        message:
          'Quantity requires at most four decimal places within the supported BOM range.',
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
