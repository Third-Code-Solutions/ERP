import { isAbsolute, relative, resolve, sep } from 'node:path'

const MAX_PO_NUMBER_LENGTH = 50

function rowValue(row, key, fallbackKey) {
  return row?.[key] ?? row?.[fallbackKey]
}

function requiredText(value, field, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new Error(`${field} must contain at most ${maxLength} characters`)
  }
  if (normalized.includes('\u0000')) {
    throw new Error(`${field} cannot contain a null byte`)
  }
  return normalized
}

function purchaseOrderNumber(value, field) {
  const normalized = requiredText(value, field, MAX_PO_NUMBER_LENGTH)
  if (value !== normalized) {
    throw new Error(`${field} cannot contain leading or trailing whitespace`)
  }
  return normalized
}

function timestampKey(value, field = 'createdAt') {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${field} must be valid`)
    return value.toISOString()
  }
  const normalized = requiredText(value, field)
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be valid`)
  return parsed.toISOString()
}

function normalizeDuplicateRow(row, index) {
  return {
    id: requiredText(
      rowValue(row, 'id', 'purchaseOrderId'),
      `duplicateRows[${index}].id`
    ),
    tenantId: requiredText(
      rowValue(row, 'tenantId', 'tenant_id'),
      `duplicateRows[${index}].tenantId`
    ),
    poNumber: purchaseOrderNumber(
      rowValue(row, 'poNumber', 'po_number'),
      `duplicateRows[${index}].poNumber`
    ),
    createdAt: timestampKey(rowValue(row, 'createdAt', 'created_at')),
  }
}

function normalizeScopedRow(row, index) {
  return {
    tenantId: requiredText(
      rowValue(row, 'tenantId', 'tenant_id'),
      `scopedRows[${index}].tenantId`
    ),
    poNumber: purchaseOrderNumber(
      rowValue(row, 'poNumber', 'po_number'),
      `scopedRows[${index}].poNumber`
    ),
  }
}

function compareDuplicateRows(left, right) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

function tenantNumberKey(tenantId, poNumber) {
  return `${tenantId}\u0000${poNumber}`
}

function replacementCandidate(currentNumber, sequence) {
  const suffix = `-R${String(sequence).padStart(2, '0')}`
  return `${currentNumber.slice(0, MAX_PO_NUMBER_LENGTH - suffix.length)}${suffix}`
}

function nextAvailableReplacement(currentNumber, tenantId, occupied, startAt) {
  let sequence = startAt
  while (sequence <= 999_999) {
    const candidate = replacementCandidate(currentNumber, sequence)
    if (!occupied.has(tenantNumberKey(tenantId, candidate))) return candidate
    sequence += 1
  }
  throw new Error('unable to allocate a deterministic replacement suggestion')
}

/**
 * Build recommendations only. Owner approval and the version-1 mapping remain
 * separate artifacts, so this output cannot pass the mapping preflight.
 */
export function buildPurchaseOrderMappingProposal({
  duplicateRows = [],
  scopedRows = [],
  capturedAt = new Date().toISOString(),
  postgresMajor = 17,
  timezone = null,
}) {
  if (!Array.isArray(duplicateRows)) {
    throw new Error('duplicateRows must be an array')
  }
  if (!Array.isArray(scopedRows)) throw new Error('scopedRows must be an array')
  if (postgresMajor !== 17) throw new Error('target is not PostgreSQL 17')

  const normalizedDuplicates = duplicateRows.map(normalizeDuplicateRow)
  const normalizedScopedRows = scopedRows.map(normalizeScopedRow)
  const recordIds = new Set()
  for (const row of normalizedDuplicates) {
    if (recordIds.has(row.id)) {
      throw new Error('duplicateRows contains a repeated Purchase Order id')
    }
    recordIds.add(row.id)
  }

  const groups = new Map()
  for (const row of normalizedDuplicates) {
    const key = tenantNumberKey(row.tenantId, row.poNumber)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  const occupied = new Set(
    normalizedScopedRows.map((row) =>
      tenantNumberKey(row.tenantId, row.poNumber)
    )
  )
  for (const row of normalizedDuplicates) {
    if (!occupied.has(tenantNumberKey(row.tenantId, row.poNumber))) {
      throw new Error('scopedRows does not cover every duplicate number')
    }
  }
  const recommendations = []
  const sortedGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) =>
      tenantNumberKey(left[0].tenantId, left[0].poNumber).localeCompare(
        tenantNumberKey(right[0].tenantId, right[0].poNumber)
      )
    )
  const groupedRecordCount = sortedGroups.reduce(
    (total, group) => total + group.length,
    0
  )
  if (groupedRecordCount !== normalizedDuplicates.length) {
    throw new Error('duplicateRows must contain only complete duplicate groups')
  }

  for (const group of sortedGroups) {
    group.sort(compareDuplicateRows)
    for (let index = 0; index < group.length; index += 1) {
      const row = group[index]
      const action = index === 0 ? 'keep' : 'renumber'
      const suggestedReplacementNumber =
        action === 'keep'
          ? row.poNumber
          : nextAvailableReplacement(
              row.poNumber,
              row.tenantId,
              occupied,
              index
            )
      occupied.add(
        tenantNumberKey(row.tenantId, suggestedReplacementNumber)
      )
      recommendations.push({
        tenantId: row.tenantId,
        purchaseOrderId: row.id,
        currentNumber: row.poNumber,
        suggestedReplacementNumber,
        suggestedAction: action,
        createdAt: row.createdAt,
      })
    }
  }

  return {
    kind: 'purchase_order_duplicate_mapping_proposal',
    proposalVersion: 1,
    mode: 'read_only',
    ownerApproval: {
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
    },
    snapshot: {
      capturedAt: timestampKey(capturedAt, 'capturedAt'),
      postgresMajor,
      timezone,
      duplicateGroups: sortedGroups.length,
      duplicateRecords: recommendations.length,
    },
    policy: {
      canonical: 'earliest createdAt, then lexical Purchase Order id',
      replacement:
        'append the first available -Rnn sequence within the 50-character limit',
    },
    recommendations,
  }
}

export function assertSafeMappingProposalPath(repoRoot, outputPath) {
  const absoluteRepo = resolve(repoRoot)
  const absoluteOutput = resolve(outputPath)
  const relativeOutput = relative(absoluteRepo, absoluteOutput)
  if (
    relativeOutput === '' ||
    (!isAbsolute(relativeOutput) &&
      relativeOutput !== '..' &&
      !relativeOutput.startsWith(`..${sep}`))
  ) {
    throw new Error('proposal file must live outside the repository')
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
    throw new Error('proposal file cannot live in a build or public-output directory')
  }
  return absoluteOutput
}
