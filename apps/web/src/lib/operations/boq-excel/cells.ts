import {
  MAX_BOM_LINE_ITEM_QUANTITY,
  parseBoqQuantity,
} from '@third-code-erp/shared-types/bom'

/**
 * Spreadsheet cell values <-> exact decimals for BOQ import and export. Money
 * is integer centavos and quantity a 4-dp decimal string; a JavaScript number
 * is only ever the cell's own storage format, never used for arithmetic.
 */

export type CellNumberProblem =
  | 'BLANK'
  | 'NOT_A_NUMBER'
  | 'FORMULA_WITHOUT_RESULT'
  | 'NEGATIVE'
  | 'OUT_OF_RANGE'

export type CellNumber<T> = { ok: true; value: T } | { ok: false; problem: CellNumberProblem }

const NO_RESULT = Symbol('formula without cached result')
// Excel shows and rounds numbers at 15 significant digits.
const EXCEL_PRECISION = 15
const QUANTITY_SCALE = 10_000n
const MAX_SCALED_QUANTITY = BigInt(MAX_BOM_LINE_ITEM_QUANTITY) * QUANTITY_SCALE
// Longer cell text is cut (description) or not a number: BigInt parsing of a
// huge digit string is quadratic, and Core keeps raw cells to 1,000 chars.
export const MAX_CELL_TEXT = 1_000
const TEXT_NUMBER = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$/
const CURRENCY_PREFIX = /^(?:₱|php)\s*/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof Date)
}

/** Formula -> cached result, rich text / hyperlink -> its text. */
function unwrapCell(value: unknown): unknown {
  if (!isRecord(value)) return value
  if ('formula' in value || 'sharedFormula' in value) {
    return value.result === undefined ? NO_RESULT : unwrapCell(value.result)
  }
  if (Array.isArray(value.richText)) {
    // Joined only as far as any reader looks (the cut plus one): a shared
    // string can hold millions of runs and is read for every cell that uses it.
    let text = ''
    for (const part of value.richText) {
      if (isRecord(part) && typeof part.text === 'string') text += part.text
      if (text.length > MAX_CELL_TEXT) break
    }
    return text
  }
  if (typeof value.text === 'string') return value.text
  return value
}

/** Display text of a cell, cut at maxLength; formula errors and missing results are blank. */
export function cellText(value: unknown, maxLength = MAX_CELL_TEXT): string {
  const unwrapped = unwrapCell(value)
  if (unwrapped == null || unwrapped === NO_RESULT || isRecord(unwrapped)) return ''
  if (unwrapped instanceof Date) return unwrapped.toISOString().slice(0, 10)
  if (typeof unwrapped === 'number') return plainDecimal(unwrapped.toPrecision(EXCEL_PRECISION))
  return String(unwrapped).slice(0, maxLength)
}

/** "1.50000000000000e-7" -> "0.00000015"; trims insignificant zeros. */
function plainDecimal(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return text
  const [, sign = '', whole = '', fraction = '', exponent = '0'] = match
  const digits = whole + fraction
  const point = whole.length + Number(exponent)
  const integerPart =
    point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')
  const fractionPart = point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point)
  const integer = integerPart.replace(/^0+(?=\d)/, '')
  const decimals = fractionPart.replace(/0+$/, '')
  const plain = decimals ? `${integer}.${decimals}` : integer
  return /^0(?:\.0*)?$/.test(plain) ? '0' : `${sign}${plain}`
}

/** A cell as a plain signed decimal string ("-1234.5"). */
export function cellDecimal(value: unknown): CellNumber<string> {
  const unwrapped = unwrapCell(value)
  if (unwrapped === NO_RESULT) return { ok: false, problem: 'FORMULA_WITHOUT_RESULT' }
  if (unwrapped == null) return { ok: false, problem: 'BLANK' }
  if (typeof unwrapped === 'number') {
    return Number.isFinite(unwrapped)
      ? { ok: true, value: plainDecimal(unwrapped.toPrecision(EXCEL_PRECISION)) }
      : { ok: false, problem: 'NOT_A_NUMBER' }
  }
  if (typeof unwrapped !== 'string' || unwrapped.length > MAX_CELL_TEXT) {
    return { ok: false, problem: 'NOT_A_NUMBER' }
  }

  let text = unwrapped.trim()
  if (!text) return { ok: false, problem: 'BLANK' }
  // Accounting negatives "(1,234.50)" and "-PHP 5" / "PHP -5" are all negative.
  const parenthesized = /^\((.*)\)$/.exec(text)
  let negative = Boolean(parenthesized)
  text = (parenthesized?.[1] ?? text).trim().replace(CURRENCY_PREFIX, '')
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1).trim().replace(CURRENCY_PREFIX, '')
  }
  const match = TEXT_NUMBER.exec(text)
  if (!match || (!match[1] && !match[2])) return { ok: false, problem: 'NOT_A_NUMBER' }
  const [, whole = '0', fraction = ''] = match
  return {
    ok: true,
    value: plainDecimal(`${negative ? '-' : ''}${whole.replace(/,/g, '')}.${fraction}0`),
  }
}

/** Non-negative decimal scaled by 10^places, rounded half-up. */
function scaledHalfUp(decimal: string, places: number): bigint {
  const [whole = '0', fraction = ''] = decimal.split('.')
  const kept = BigInt(whole + fraction.slice(0, places).padEnd(places, '0'))
  return (fraction[places] ?? '0') >= '5' ? kept + 1n : kept
}

function nonNegativeScaled(value: unknown, places: number): CellNumber<bigint> {
  const decimal = cellDecimal(value)
  if (!decimal.ok) return decimal
  if (decimal.value.startsWith('-')) return { ok: false, problem: 'NEGATIVE' }
  return { ok: true, value: scaledHalfUp(decimal.value, places) }
}

/** Cell -> canonical BOQ quantity string, half-up to 4 dp. */
export function cellQuantity(value: unknown): CellNumber<string> {
  const scaled = nonNegativeScaled(value, 4)
  if (!scaled.ok) return scaled
  if (scaled.value > MAX_SCALED_QUANTITY) return { ok: false, problem: 'OUT_OF_RANGE' }
  const fraction = String(scaled.value % QUANTITY_SCALE).padStart(4, '0')
  const quantity = parseBoqQuantity(`${scaled.value / QUANTITY_SCALE}.${fraction}`)
  return quantity === null ? { ok: false, problem: 'OUT_OF_RANGE' } : { ok: true, value: quantity }
}

/** Cell holding pesos -> integer centavos, half-up. */
export function cellCentavos(value: unknown, maxCentavos: number): CellNumber<number> {
  const scaled = nonNegativeScaled(value, 2)
  if (!scaled.ok) return scaled
  return scaled.value > BigInt(maxCentavos)
    ? { ok: false, problem: 'OUT_OF_RANGE' }
    : { ok: true, value: Number(scaled.value) }
}

/** 123456 -> "1234.56" (exact). */
export function centavosDecimal(centavos: number | bigint): string {
  const value = BigInt(centavos)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

/** 123456 -> "1,234.56". */
export function formatCentavos(centavos: number | bigint): string {
  const [whole = '0', fraction = '00'] = centavosDecimal(centavos).split('.')
  const negative = whole.startsWith('-')
  const grouped = BigInt(negative ? whole.slice(1) : whole).toLocaleString('en-PH')
  return `${negative ? '-' : ''}${grouped}.${fraction}`
}

// Control characters other than tab/newline, U+FFFE/U+FFFF and lone surrogates
// are not valid XML text, so Excel would refuse the file.
const INVALID_TEXT =
  /[\u0000-\u0008\u000B-\u001F\u007F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Text for an exported cell: characters XML cannot carry are removed. */
export function excelText(value: string | null | undefined): string {
  return (value ?? '').replace(INVALID_TEXT, '')
}

/** Text Excel (or a CSV re-save) would turn into a formula; a leading tab hides the trigger. */
export function looksLikeFormula(value: string): boolean {
  return /^[=+\-@\t]/.test(value)
}
