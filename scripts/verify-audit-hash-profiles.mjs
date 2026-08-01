#!/usr/bin/env node

/**
 * Read-only audit hash profile verifier.
 *
 * Required environment:
 *   DATABASE_URL
 *   AUDIT_RECOVERY_TENANT_ID
 *
 * It compares only the current PostgreSQL trigger formula and the historical
 * JSON writer formula. It emits counts and system labels, never entity IDs or
 * business values, and never changes database state.
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyAuditHash,
  isUuid,
  opaqueRef,
} from './lib/audit-recovery-plan.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const requireCurrent = process.argv.includes('--require-current')
const databaseUrl = process.env.DATABASE_URL
const tenantId = process.env.AUDIT_RECOVERY_TENANT_ID

if (!databaseUrl || !tenantId) {
  console.error(
    'Required environment: DATABASE_URL, AUDIT_RECOVERY_TENANT_ID'
  )
  process.exit(1)
}
if (!isUuid(tenantId)) {
  console.error('AUDIT_RECOVERY_TENANT_ID must be a canonical UUID')
  process.exit(1)
}

const postgres = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

function iso(value) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

try {
  const report = await sql.begin(
    'isolation level repeatable read read only',
    async (transaction) => {
      const [server] = await transaction.unsafe(
        "select current_setting('server_version_num') as server_version_num, current_setting('TimeZone') as timezone"
      )
      const [tenant] = await transaction`
        select id from public.tenants where id = ${tenantId}::uuid
      `
      const rows = await transaction`
        select
          id,
          entity_type,
          action,
          entity_id::text as entity_id,
          prev_hash,
          hash,
          diff,
          created_at,
          created_at::text as created_at_text
        from public.audit_log
        where tenant_id = ${tenantId}::uuid
        order by id
      `

      const profiles = {
        database: 0,
        legacy_json: 0,
        both: 0,
        unknown: 0,
      }
      const byDay = new Map()
      const byEntity = new Map()
      let linkMismatches = 0
      let priorHash = null

      for (const row of rows) {
        const createdAtIso = iso(row.created_at)
        const profile = classifyAuditHash({
          prevHash: row.prev_hash,
          entityType: row.entity_type,
          entityId: row.entity_id,
          action: row.action,
          diff: row.diff,
          createdAtIso,
          createdAtText: row.created_at_text,
          hash: row.hash,
        })
        profiles[profile] += 1
        const linkMatches =
          priorHash === null
            ? row.prev_hash === 'genesis'
            : row.prev_hash === priorHash
        if (!linkMatches) linkMismatches += 1
        priorHash = row.hash

        const day = createdAtIso?.slice(0, 10) ?? null
        const dayBucket = byDay.get(day) ?? {
          day,
          rows: 0,
          database: 0,
          legacyJson: 0,
          both: 0,
          unknown: 0,
        }
        dayBucket.rows += 1
        if (profile === 'legacy_json') dayBucket.legacyJson += 1
        else dayBucket[profile] += 1
        byDay.set(day, dayBucket)

        const key = `${row.entity_type}|${row.action}`
        const entityBucket = byEntity.get(key) ?? {
          entityType: row.entity_type,
          action: row.action,
          rows: 0,
          database: 0,
          legacyJson: 0,
          both: 0,
          unknown: 0,
        }
        entityBucket.rows += 1
        if (profile === 'legacy_json') entityBucket.legacyJson += 1
        else entityBucket[profile] += 1
        byEntity.set(key, entityBucket)
      }

      const baseReport = {
        mode: 'read_only',
        generatedAt: new Date().toISOString(),
        database: {
          postgresMajor: Math.floor(
            Number(server?.server_version_num ?? 0) / 10_000
          ),
          timezone: server?.timezone ?? null,
        },
        target: {
          tenantRef: opaqueRef(tenantId),
          tenantExists: Boolean(tenant),
        },
        audit: {
          rows: rows.length,
          linkMismatches,
          profiles,
          byDay: [...byDay.values()].filter(
            (bucket) => bucket.legacyJson > 0 || bucket.unknown > 0
          ),
          byEntity: [...byEntity.values()]
            .filter(
              (bucket) => bucket.legacyJson > 0 || bucket.unknown > 0
            )
            .sort(
              (left, right) =>
                right.unknown + right.legacyJson -
                (left.unknown + left.legacyJson)
            ),
        },
      }
      const blockers = []
      if (baseReport.database.postgresMajor !== 17) {
        blockers.push('target is not PostgreSQL 17')
      }
      if (!baseReport.target.tenantExists) {
        blockers.push('tenant does not exist')
      }
      if (linkMismatches > 0) {
        blockers.push('tenant audit predecessor chain is discontinuous')
      }
      if (profiles.legacy_json > 0) {
        blockers.push('legacy JSON audit hash profile is present')
      }
      if (profiles.unknown > 0) {
        blockers.push('audit rows match neither reviewed hash profile')
      }
      return { ...baseReport, blockers }
    }
  )

  const status = report.blockers.length === 0 ? 'clear' : 'review_required'
  const output = { ...report, status }
  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('Third Code ERP audit hash profile report (READ ONLY)')
    console.log(`Status: ${status}`)
    console.log(`Tenant ref: ${report.target.tenantRef}`)
    console.log(
      `Rows: ${report.audit.rows}; links: ${report.audit.linkMismatches}; profiles: ${JSON.stringify(report.audit.profiles)}`
    )
    for (const blocker of report.blockers) console.log(`- ${blocker}`)
    console.log('No business values or identifiers were printed.')
    console.log('No database state was changed.')
  }
  if (requireCurrent && report.blockers.length > 0) process.exitCode = 2
} catch (error) {
  console.error(
    `Audit hash profile verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}

