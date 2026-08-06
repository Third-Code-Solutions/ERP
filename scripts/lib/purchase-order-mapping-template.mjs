import { isAbsolute, relative, resolve, sep } from 'node:path'

function rowValue(row, key, fallbackKey) {
  return row?.[key] ?? row?.[fallbackKey]
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  if (value.includes('\u0000')) {
    throw new Error(`${field} cannot contain a null byte`)
  }
  return value.trim()
}

function rowSortKey(row) {
  const createdAt = rowValue(row, 'createdAt', 'created_at')
  const createdKey = createdAt instanceof Date
    ? createdAt.toISOString()
    : String(createdAt ?? '')
  return [
    requiredText(rowValue(row, 'tenantId', 'tenant_id'), 'tenantId'),
    requiredText(rowValue(row, 'poNumber', 'po_number'), 'poNumber'),
    createdKey,
    requiredText(rowValue(row, 'id', 'purchaseOrderId'), 'id'),
  ]
}

function compareRows(left, right) {
  const a = rowSortKey(left)
  const b = rowSortKey(right)
  for (let index = 0; index < a.length; index += 1) {
    const comparison = a[index].localeCompare(b[index])
    if (comparison !== 0) return comparison
  }
  return 0
}

/**
 * Build an owner-review mapping skeleton from one read-only snapshot.
 *
 * Replacement numbers are intentionally blank. The generator never guesses
 * a canonical row or a replacement number; the database owner must fill and
 * approve those values before the mapping preflight can pass.
 */
export function buildPurchaseOrderMappingTemplate({
  rows = [],
  capturedAt = new Date().toISOString(),
  postgresMajor = 17,
  timezone = null,
}) {
  if (!Array.isArray(rows)) throw new Error('rows must be an array')
  if (typeof capturedAt !== 'string' || capturedAt.length === 0) {
    throw new Error('capturedAt must be a non-empty string')
  }

  const normalizedRows = rows.map((row, index) => ({
    id: requiredText(rowValue(row, 'id', 'purchaseOrderId'), `rows[${index}].id`),
    tenantId: requiredText(
      rowValue(row, 'tenantId', 'tenant_id'),
      `rows[${index}].tenantId`
    ),
    poNumber: requiredText(
      rowValue(row, 'poNumber', 'po_number'),
      `rows[${index}].poNumber`
    ),
    createdAt: rowValue(row, 'createdAt', 'created_at') ?? null,
  }))

  const groups = new Map()
  for (const row of normalizedRows) {
    const key = `${row.tenantId}\u0000${row.poNumber}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  const entries = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort(compareRows)
    for (const row of group) {
      entries.push({
        tenantId: row.tenantId,
        purchaseOrderId: row.id,
        currentNumber: row.poNumber,
        // Deliberately invalid until an owner supplies a decision. The
        // mapping validator will fail closed if this skeleton is used as-is.
        replacementNumber: '',
      })
    }
  }

  entries.sort((left, right) =>
    `${left.tenantId}\u0000${left.currentNumber}\u0000${left.purchaseOrderId}`
      .localeCompare(
        `${right.tenantId}\u0000${right.currentNumber}\u0000${right.purchaseOrderId}`
      )
  )

  return {
    version: 1,
    snapshot: {
      capturedAt,
      postgresMajor,
      timezone,
      duplicateRecords: entries.length,
    },
    entries,
  }
}

/**
 * Mapping artifacts contain tenant IDs and business numbers. Require an
 * explicit path outside the repository and known build/output directories.
 */
export function assertSafeMappingTemplatePath(repoRoot, outputPath) {
  const absoluteRepo = resolve(repoRoot)
  const absoluteOutput = resolve(outputPath)
  const relativeOutput = relative(absoluteRepo, absoluteOutput)
  if (
    relativeOutput === '' ||
    (!isAbsolute(relativeOutput) &&
      relativeOutput !== '..' &&
      !relativeOutput.startsWith(`..${sep}`))
  ) {
    throw new Error('template file must live outside the repository')
  }

  const normalized = absoluteOutput.replaceAll('\\', '/').toLowerCase()
  const forbiddenSegments = [
    '/node_modules/',
    '/.next/',
    '/public/',
    '/dist/',
    '/build/',
    '/out/',
    '/output/',
  ]
  if (forbiddenSegments.some((segment) => normalized.includes(segment))) {
    throw new Error('template file cannot live in a build or public-output directory')
  }
  return absoluteOutput
}
