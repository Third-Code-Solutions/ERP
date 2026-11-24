import { csvCell } from '@/lib/csv-cell'

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/
// Excel reads UTF-8 without a BOM as ANSI and garbles supplier names.
const UTF8_BOM = '﻿'

/** Text cell: the opportunity export's rule (quoted when needed, formula leads neutralised). */
export function csvTextCell(value: string): string {
  return csvCell(value, true)
}

/**
 * Numeric cell: emitted bare so a legitimate negative amount stays a number.
 * Anything that is not a plain number falls back to the text path, so an
 * attacker-controlled value can never reach a spreadsheet as a formula.
 */
export function csvNumberCell(value: string): string {
  return PLAIN_NUMBER.test(value) ? value : csvTextCell(value)
}

export interface CsvColumn<Row> {
  header: string
  numeric?: boolean
  value: (row: Row) => string
}

/** The header row comes first, so header-first readers (pandas, Power Query) parse the file. */
export function encodeCsv<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[]
): string {
  const lines: string[] = [columns.map((column) => csvTextCell(column.header)).join(',')]
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
