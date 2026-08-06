import { opaqueRef } from './purchase-order-duplicate-plan.mjs'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function normalizeText(value, field, maxLength = 50) {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`)
  }
  if (normalized.includes('\u0000')) {
    throw new Error(`${field} cannot contain a null byte`)
  }
  return normalized
}

export function normalizePurchaseOrderMapping(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('mapping must be a JSON object')
  }
  if (input.version !== 1) {
    throw new Error('mapping.version must equal 1')
  }
  if (!Array.isArray(input.entries)) {
    throw new Error('mapping.entries must be an array')
  }

  const entries = input.entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`mapping.entries[${index}] must be an object`)
    }
    const tenantId = normalizeText(entry.tenantId, `entries[${index}].tenantId`, 36)
    const purchaseOrderId = normalizeText(
      entry.purchaseOrderId,
      `entries[${index}].purchaseOrderId`,
      36
    )
    if (!isUuid(tenantId)) {
      throw new Error(`entries[${index}].tenantId must be a UUID`)
    }
    if (!isUuid(purchaseOrderId)) {
      throw new Error(`entries[${index}].purchaseOrderId must be a UUID`)
    }
    return {
      tenantId: tenantId.toLowerCase(),
      purchaseOrderId: purchaseOrderId.toLowerCase(),
      currentNumber: normalizeText(
        entry.currentNumber,
        `entries[${index}].currentNumber`
      ),
      replacementNumber: normalizeText(
        entry.replacementNumber,
        `entries[${index}].replacementNumber`
      ),
    }
  })

  const recordRefs = new Set()
  const targetRefs = new Set()
  for (const entry of entries) {
    if (recordRefs.has(entry.purchaseOrderId)) {
      throw new Error('mapping contains a duplicate Purchase Order id')
    }
    recordRefs.add(entry.purchaseOrderId)

    const targetRef = `${entry.tenantId}:${entry.replacementNumber}`
    if (targetRefs.has(targetRef)) {
      throw new Error(
        'mapping contains duplicate replacement numbers within a tenant'
      )
    }
    targetRefs.add(targetRef)
  }

  return entries
}

function sortedRefs(values) {
  return [...values].sort().map(opaqueRef)
}

function rowKey(row) {
  return String(row.purchaseOrderId ?? row.id ?? '').toLowerCase()
}

function tenantKey(row) {
  return String(row.tenantId ?? '').toLowerCase()
}

function numberKey(row) {
  return String(row.poNumber ?? row.po_number ?? '')
}

/**
 * Validate an owner mapping against a repeatable-read database snapshot.
 * Inputs contain business values for in-memory comparison only; output never
 * includes UUIDs or Purchase Order numbers.
 */
export function validatePurchaseOrderMapping({
  mapping,
  duplicateRows = [],
  scopedRows = [],
}) {
  const blockers = []
  let entries
  try {
    entries = normalizePurchaseOrderMapping(mapping)
  } catch (error) {
    return {
      status: 'review_required',
      mode: 'read_only',
      mappingEntries: 0,
      duplicateRecords: duplicateRows.length,
      blockers: [error instanceof Error ? error.message : String(error)],
      conflicts: {
        missingEntryRefs: [],
        extraEntryRefs: [],
        staleEntryRefs: [],
        tenantMismatchRefs: [],
        occupiedTargetRefs: [],
      },
    }
  }

  const duplicateById = new Map(duplicateRows.map((row) => [rowKey(row), row]))
  const scopedById = new Map(scopedRows.map((row) => [rowKey(row), row]))
  const mappedIds = new Set(entries.map((entry) => entry.purchaseOrderId))
  const duplicateIds = new Set(duplicateById.keys())

  const missingEntryIds = [...duplicateIds].filter((id) => !mappedIds.has(id))
  const extraEntryIds = new Set(
    [...mappedIds].filter((id) => !duplicateIds.has(id))
  )
  const staleEntryIds = []
  const tenantMismatchIds = []

  for (const entry of entries) {
    const row = scopedById.get(entry.purchaseOrderId)
    if (!row) {
      extraEntryIds.add(entry.purchaseOrderId)
      continue
    }
    if (tenantKey(row) !== entry.tenantId) {
      tenantMismatchIds.push(entry.purchaseOrderId)
    }
    if (numberKey(row) !== entry.currentNumber) {
      staleEntryIds.push(entry.purchaseOrderId)
    }
  }

  const mappedTargetRefs = new Set(
    entries.map((entry) => `${entry.tenantId}:${entry.replacementNumber}`)
  )
  const occupiedTargetIds = []
  for (const row of scopedRows) {
    if (mappedIds.has(rowKey(row))) continue
    const targetRef = `${tenantKey(row)}:${numberKey(row)}`
    if (mappedTargetRefs.has(targetRef)) occupiedTargetIds.push(rowKey(row))
  }

  if (missingEntryIds.length > 0) {
    blockers.push('mapping does not cover every duplicate Purchase Order')
  }
  if (extraEntryIds.length > 0) {
    blockers.push('mapping contains a non-duplicate or unknown Purchase Order')
  }
  if (staleEntryIds.length > 0) {
    blockers.push('mapping current numbers do not match the database snapshot')
  }
  if (tenantMismatchIds.length > 0) {
    blockers.push('mapping tenant does not match the database row')
  }
  if (occupiedTargetIds.length > 0) {
    blockers.push('replacement number is already used by another Purchase Order')
  }

  return {
    status: blockers.length === 0 ? 'ready' : 'review_required',
    mode: 'read_only',
    mappingEntries: entries.length,
    duplicateRecords: duplicateRows.length,
    blockers,
    conflicts: {
      missingEntryRefs: sortedRefs(missingEntryIds),
      extraEntryRefs: sortedRefs(extraEntryIds),
      staleEntryRefs: sortedRefs(staleEntryIds),
      tenantMismatchRefs: sortedRefs(tenantMismatchIds),
      occupiedTargetRefs: sortedRefs(occupiedTargetIds),
    },
  }
}
