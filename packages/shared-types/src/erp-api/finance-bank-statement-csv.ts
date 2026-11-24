export interface ParsedBankStatementLine {
  transactionDate: string
  referenceNumber: string | null
  description: string
  amountCents: number
}

export interface NumberedBankStatementLine extends ParsedBankStatementLine {
  /** 1 for the first row with this date, reference, description and amount; N for the Nth identical row. */
  occurrence: number
}

interface CsvRecord {
  cells: string[]
  /** 1-based line of the record in the file, counting blank lines. */
  line: number
}

function parseCsvRows(input: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let quoteLine = 1

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        if (character === '\n') line += 1
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(
          `Line ${line} has a stray quote. Quotes may only wrap a whole field; write a quote inside a field as two quotes.`
        )
      }
      quoted = true
      quoteLine = line
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      records.push({ cells: row, line: recordLine })
      row = []
      field = ''
      line += 1
      recordLine = line
    } else {
      field += character
    }
  }

  if (quoted) throw new Error(`Line ${quoteLine} has a quote that is never closed.`)
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    records.push({ cells: row, line: recordLine })
  }

  return records.filter((candidate) =>
    candidate.cells.some((value) => value.trim().length > 0)
  )
}

function parseDate(value: string, line: number): string {
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Line ${line} date must use YYYY-MM-DD`)
  }
  const date = new Date(`${normalized}T00:00:00Z`)
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error(`Line ${line} contains an invalid calendar date`)
  }
  return normalized
}

function parseSignedMoney(value: string, line: number): number {
  const normalized = value.replaceAll(',', '').trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      `Line ${line} amount must be a signed number with at most two decimals`
    )
  }
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, decimals = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  const signed = negative ? -cents : cents
  if (!Number.isSafeInteger(signed) || signed === 0) {
    throw new Error(`Line ${line} amount must be a safe, non-zero value`)
  }
  return signed
}

export function parseBankStatementCsv(
  input: string
): ParsedBankStatementLine[] {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ''))
  if (rows.length < 2) {
    throw new Error('CSV requires a header and at least one statement line')
  }

  const header = rows[0]!.cells.map((value) => value.trim().toLowerCase())
  const required = ['date', 'reference', 'description', 'amount'] as const
  const positions = Object.fromEntries(
    required.map((name) => [name, header.indexOf(name)])
  ) as Record<(typeof required)[number], number>
  if (required.some((name) => positions[name] < 0)) {
    throw new Error(
      'CSV header must include date, reference, description, amount'
    )
  }
  if (rows.length - 1 > 5_000) {
    throw new Error('A statement can contain at most 5,000 lines')
  }

  return rows.slice(1).map(({ cells: row, line }) => {
    const description = (row[positions.description] ?? '').trim()
    if (!description || description.length > 2_000) {
      throw new Error(`Line ${line} requires a concise description`)
    }
    const reference = (row[positions.reference] ?? '').trim()
    if (reference.length > 120) {
      throw new Error(`Line ${line} reference is too long`)
    }
    return {
      transactionDate: parseDate(row[positions.date] ?? '', line),
      referenceNumber: reference || null,
      description,
      amountCents: parseSignedMoney(row[positions.amount] ?? '', line),
    }
  })
}

/**
 * Two identical rows on one statement are two real bank entries (two same-day
 * fees, repeated card settlements). Number the Nth copy N so the statement-line
 * fingerprint (which ends in `occurrence`) stays unique. Rows are compared
 * ignoring case and surrounding spaces, which is at least as strict as the
 * database fingerprint (it only lowercases the description), so the database
 * never sees two rows the same.
 */
export function numberBankStatementOccurrences(
  lines: readonly ParsedBankStatementLine[]
): NumberedBankStatementLine[] {
  const seen = new Map<string, number>()
  return lines.map((line) => {
    const fingerprint = [
      line.transactionDate,
      line.referenceNumber?.toLowerCase() ?? '',
      line.amountCents,
      line.description.trim().toLowerCase(),
    ].join('|')
    const occurrence = (seen.get(fingerprint) ?? 0) + 1
    seen.set(fingerprint, occurrence)
    return { ...line, occurrence }
  })
}
