// A leading byte that spreadsheets read as the start of a formula or command.
const FORMULA_LEAD = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/
// Excel reads UTF-8 without a BOM as ANSI and garbles supplier names.
const UTF8_BOM = '﻿'

/** Text cell: always quoted, embedded quotes doubled, formula leads neutralised with an apostrophe. */
export function csvTextCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * Numeric cell: emitted bare so a legitimate negative amount stays a number.
 * Anything that is not a plain number falls back to the text path, so an
 * attacker-controlled value can never reach a spreadsheet unquoted.
 */
export function csvNumberCell(value: string): string {
  return PLAIN_NUMBER.test(value) ? value : csvTextCell(value)
}

export interface CsvColumn<Row> {
  header: string
  numeric?: boolean
  value: (row: Row) => string
}

/** Optional notice becomes a first line above the header row (used to flag truncated exports). */
export function encodeCsv<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
  notice?: string
): string {
  const lines: string[] = []
  if (notice) lines.push(csvTextCell(notice))
  lines.push(columns.map((column) => csvTextCell(column.header)).join(','))
  for (const row of rows) {
    lines.push(
      columns
        .map((column) =>
          column.numeric
            ? csvNumberCell(column.value(row))
            : csvTextCell(column.value(row))
        )
        .join(',')
    )
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}
