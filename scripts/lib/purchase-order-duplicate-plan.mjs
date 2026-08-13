import { createHash } from 'node:crypto'

export function opaqueRef(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

export function parsePositiveLimit(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error(`${name} must be an integer between 1 and 500`)
  }
  return parsed
}

export function buildPurchaseOrderDuplicateBlockers(report) {
  const blockers = []

  if (report.database.postgresMajor !== 17) {
    blockers.push('target is not PostgreSQL 17')
  }
  if (report.duplicates.groups > 0) {
    blockers.push('tenant Purchase Order numbers are not unique')
  }
  if (report.duplicates.truncated) {
    blockers.push('duplicate report is truncated')
  }

  return blockers
}

export function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    const status = String(row.status ?? 'unknown')
    counts[status] = (counts[status] ?? 0) + 1
    return counts
  }, {})
}
