import { createHash } from 'node:crypto'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const PROJECT_UPDATE_ROLES = new Set([
  'owner',
  'admin',
  'sales',
  'commercial',
  'sd_pm_pe',
  'pm',
])

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function opaqueRef(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForJson(entry)])
    )
  }
  return value
}

export function evidenceDigest(value) {
  const canonical = JSON.stringify(sortForJson(value))
  return createHash('sha256').update(canonical).digest('hex')
}

export function buildProjectCutoverBlockers(report) {
  const blockers = []

  if (report.database.postgresMajor !== 17) {
    blockers.push('target is not PostgreSQL 17')
  }
  if (!report.target.tenantExists) {
    blockers.push('tenant does not exist')
  }
  if (!report.target.projectExists) {
    blockers.push('Project does not exist in the designated tenant')
  }
  if (!report.target.actorExists) {
    blockers.push('actor does not exist in the designated tenant')
  }
  if (
    report.target.actorExists &&
    !PROJECT_UPDATE_ROLES.has(report.target.actorRole)
  ) {
    blockers.push('actor lacks project.update capability')
  }
  if (!report.target.authIdentityExists) {
    blockers.push('actor has no Supabase Auth identity')
  }
  if (!report.controls.projectAuditTrigger) {
    blockers.push('Project audit trigger is missing')
  }
  if (!report.controls.auditFunctionHardened) {
    blockers.push('audit trigger function is not hardened')
  }
  if (!report.controls.auditFunctionNotPublic) {
    blockers.push('audit trigger function is executable by public API roles')
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
  if (report.target.projectExists && report.audit.projectRows === 0) {
    blockers.push('Project has no audit history')
  }

  return blockers
}
