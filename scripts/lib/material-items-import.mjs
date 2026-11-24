import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'

// Pure parsing and planning for scripts/import-material-items.mjs. No I/O here, so
// the dry-run report and the inserts come from the same rows and the rules are
// unit tested without a database.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_ROWS = 5000
const COLUMNS = ['code', 'description', 'unit', 'tracked']
const TRUE_WORDS = new Set(['yes', 'y', 'true', '1'])
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', ''])
// Line breaks inside a quoted code, or terminal escape sequences in the report.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

export const USAGE = [
  'Usage: node scripts/import-material-items.mjs --tenant-id <uuid> --csv <file> [options]',
  '  --csv <file>             header: code,description,unit[,tracked]  (tracked: yes/no, blank = no)',
  "  --actor-user-id <uuid>   default: the tenant's earliest active owner/admin",
  "  --apply                  write the items (default is a dry run). Holds the tenant's",
  '                           audit lock until it commits, so app writes that audit wait.',
  'DATABASE_URL must be set in the environment.',
].join('\n')

export function parseImportArgs(argv) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        'tenant-id': { type: 'string' },
        csv: { type: 'string' },
        'actor-user-id': { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    throw new Error(`${error.message}\n\n${USAGE}`)
  }
  const tenantId = values['tenant-id']?.trim().toLowerCase()
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    throw new Error(`--tenant-id <uuid> is required\n\n${USAGE}`)
  }
  const csvPath = values.csv?.trim()
  if (!csvPath) throw new Error(`--csv <file> is required\n\n${USAGE}`)
  const actor = values['actor-user-id']?.trim().toLowerCase()
  if (actor !== undefined && !UUID_PATTERN.test(actor)) {
    throw new Error(`--actor-user-id must be a UUID\n\n${USAGE}`)
  }
  return { tenantId, csvPath, actorUserId: actor ?? null, apply: values.apply }
}

/** RFC 4180 records (quoted fields, doubled quotes, CRLF or LF). Blank records are dropped. */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, '')
  const records = []
  let cells = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      cells.push(field)
      field = ''
    } else if (char === '\n') {
      cells.push(field)
      records.push(cells)
      cells = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (quoted) throw new Error('The CSV has a quoted field that is never closed.')
  if (field !== '' || cells.length > 0) {
    cells.push(field)
    records.push(cells)
  }
  return records
    .map((record, index) => ({ line: index + 1, cells: record }))
    .filter(({ cells: record }) => !(record.length === 1 && record[0].trim() === ''))
}

/** Rows of a material item CSV and every problem found, so one run reports them all. */
export function parseMaterialItemsCsv(text) {
  const errors = []
  const rows = []
  const records = parseCsv(text)
  if (records.length === 0) return { rows, errors: [{ line: 1, message: 'The CSV is empty.' }] }

  const header = records[0].cells.map((cell) => cell.trim().toLowerCase())
  for (const [index, name] of header.entries()) {
    if (!COLUMNS.includes(name)) {
      errors.push({ line: 1, message: `Unknown column "${name}". Columns are ${COLUMNS.join(', ')}.` })
    } else if (header.indexOf(name) !== index) {
      errors.push({ line: 1, message: `Column "${name}" appears more than once.` })
    }
  }
  for (const name of ['code', 'description', 'unit']) {
    if (!header.includes(name)) errors.push({ line: 1, message: `Missing column "${name}".` })
  }
  if (errors.length > 0) return { rows, errors }
  if (records.length - 1 > MAX_ROWS) {
    return { rows, errors: [{ line: 1, message: `At most ${MAX_ROWS} items per import.` }] }
  }

  const seen = new Map()
  for (const { line, cells } of records.slice(1)) {
    const value = (name) => (cells[header.indexOf(name)] ?? '').trim()
    const row = {
      line,
      code: value('code'),
      description: value('description'),
      unit: value('unit'),
      tracked: false,
    }
    const problems = []
    // An unquoted comma shifts every later column (a description "Bolt, M" would
    // become unit M, which cannot change once stock is posted), so refuse the row.
    if (cells.length > header.length) {
      problems.push(`has ${cells.length} cells, header has ${header.length} (quote a value that contains a comma)`)
    }
    if (!row.code) problems.push('code is required')
    else if (row.code.length > 64) problems.push('code is longer than 64 characters')
    if (!row.description) problems.push('description is required')
    if (!row.unit) problems.push('unit is required')
    else if (row.unit.length > 32) problems.push('unit is longer than 32 characters')
    for (const name of ['code', 'description', 'unit']) {
      if (CONTROL_CHARACTER.test(row[name])) problems.push(`${name} contains a control character`)
    }
    if (header.includes('tracked')) {
      const word = value('tracked').toLowerCase()
      if (TRUE_WORDS.has(word)) row.tracked = true
      else if (!FALSE_WORDS.has(word)) problems.push(`tracked must be yes or no, not "${value('tracked')}"`)
    }
    if (row.code && seen.has(row.code)) {
      problems.push(`code ${row.code} is repeated (first on line ${seen.get(row.code)})`)
    } else if (row.code) seen.set(row.code, line)

    if (problems.length > 0) errors.push({ line, message: problems.join('; ') })
    else rows.push(row)
  }
  return { rows, errors }
}

/** UOM code first (case-insensitive), then a tenant alias; null when neither matches. */
export function resolveUnit(text, existing) {
  const wanted = text.trim().toLowerCase()
  const uom = existing.unitsOfMeasure.find((row) => row.code.toLowerCase() === wanted)
  if (uom) return uom.code
  const alias = (existing.unitAliases ?? []).find((row) => row.alias.toLowerCase() === wanted)
  return alias ? alias.uom_code : null
}

/**
 * Splits parsed rows into items to insert, items that already exist (kept as they
 * are, never updated) and rows that cannot be imported. A unit that is neither a
 * unit of measure nor an alias is an error: the importer never invents units.
 *
 * `existing`: { itemCodes: string[], unitsOfMeasure: [{ code }], unitAliases: [{ alias, uom_code }] | null }
 */
export function planMaterialItemsImport(rows, existing) {
  const taken = new Set(existing.itemCodes)
  const plan = { insert: [], present: [], errors: [] }
  for (const row of rows) {
    if (taken.has(row.code)) {
      plan.present.push({ row, reason: 'code exists, left unchanged' })
      continue
    }
    const unit = resolveUnit(row.unit, existing)
    if (!unit) {
      plan.errors.push({
        line: row.line,
        message: `unit "${row.unit}" is not a unit of measure or alias of this tenant`,
      })
      continue
    }
    plan.insert.push({ ...row, unit })
  }
  return plan
}

export function formatImportReport(plan, context) {
  const lines = [
    `Tenant: ${context.tenantName} (${context.tenantId})`,
    `Actor:  ${context.actorUserId} (${context.actorSource})`,
    `Mode:   ${context.apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`,
    '',
    `Items: insert ${plan.insert.length}, already present ${plan.present.length}, errors ${plan.errors.length}`,
  ]
  for (const row of plan.insert) {
    lines.push(`  + ${row.code} ${row.description} [${row.unit}]${row.tracked ? ' tracked' : ''}`)
  }
  for (const { row, reason } of plan.present) lines.push(`  = ${row.code} (${reason})`)
  for (const { line, message } of plan.errors) lines.push(`  ! line ${line}: ${message}`)
  return lines
}

/**
 * The public.audit_log hash of a material item create, the same input as
 * computeDatabaseAuditHash in @third-code-erp/shared-types: prev hash, entity
 * type, entity id, action and the timestamp as PostgreSQL prints it in UTC.
 */
export function materialItemAuditHash(prevHash, itemId, createdAt) {
  const [date, time] = createdAt.toISOString().replace('Z', '').split('T')
  const [clock, fraction = ''] = time.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  const stamp = `${date} ${clock}${trimmed ? `.${trimmed}` : ''}+00`
  return createHash('sha256')
    .update(`${prevHash}material_item${itemId}create${stamp}`, 'utf8')
    .digest('hex')
}
