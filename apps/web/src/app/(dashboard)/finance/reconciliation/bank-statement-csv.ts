export interface ParsedBankStatementLine {
  transactionDate: string
  referenceNumber: string | null
  description: string
  amountCents: number
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

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
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) throw new Error('Malformed CSV quote')
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('Unclosed CSV quote')
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }

  return rows.filter((candidate) =>
    candidate.some((value) => value.trim().length > 0)
  )
}

function parseDate(value: string): string {
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Statement dates must use YYYY-MM-DD')
  }
  const date = new Date(`${normalized}T00:00:00Z`)
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error('Statement contains an invalid calendar date')
  }
  return normalized
}

function parseSignedMoney(value: string): number {
  const normalized = value.replaceAll(',', '').trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Statement amounts must be signed numbers with two decimals')
  }
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, decimals = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  const signed = negative ? -cents : cents
  if (!Number.isSafeInteger(signed) || signed === 0) {
    throw new Error('Statement amounts must be safe, non-zero values')
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

  const header = rows[0]!.map((value) => value.trim().toLowerCase())
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

  return rows.slice(1).map((row, index) => {
    const description = (row[positions.description] ?? '').trim()
    if (!description || description.length > 2_000) {
      throw new Error(`Line ${index + 2} requires a concise description`)
    }
    const reference = (row[positions.reference] ?? '').trim()
    if (reference.length > 120) {
      throw new Error(`Line ${index + 2} reference is too long`)
    }
    return {
      transactionDate: parseDate(row[positions.date] ?? ''),
      referenceNumber: reference || null,
      description,
      amountCents: parseSignedMoney(row[positions.amount] ?? ''),
    }
  })
}
