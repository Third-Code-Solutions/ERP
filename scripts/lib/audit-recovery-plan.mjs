import { createHash } from 'node:crypto'

export function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
}
export function opaqueRef(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function databaseAuditHash(row) {
  return sha256(
    row.prevHash +
      row.entityType +
      row.entityId +
      row.action +
      row.createdAtText
  )
}

export function legacyJsonAuditHash(row) {
  return sha256(
    JSON.stringify({
      prev: row.prevHash,
      entity_type: row.entityType,
      entity_id: row.entityId,
      action: row.action,
      diff: row.diff,
      created_at: row.createdAtIso,
    })
  )
}

export function classifyAuditHash(row) {
  const current = row.hash === databaseAuditHash(row)
  const legacy = row.hash === legacyJsonAuditHash(row)
  if (current && legacy) return 'both'
  if (current) return 'database'
  if (legacy) return 'legacy_json'
  return 'unknown'
}

export function buildAuditRecoveryBlockers(report) {
  const blockers = []

  if (report.database.postgresMajor !== 17) {
    blockers.push('target is not PostgreSQL 17')
  }
  if (!report.target.tenantExists) {
    blockers.push('tenant does not exist')
  }
  if (report.audit.rows === 0) {
    blockers.push('tenant has no audit root')
  }
  if (report.audit.linkMismatches > 0) {
    blockers.push('tenant audit predecessor chain is discontinuous')
  }
  if (report.audit.hashMismatches > 0) {
    blockers.push('tenant audit hashes do not verify')
  }
  if (!report.controls.auditFunctionHardened) {
    blockers.push('audit trigger function is not hardened')
  }
  if (!report.controls.auditFunctionNotPublic) {
    blockers.push('audit trigger function is executable by public API roles')
  }

  return blockers
}
