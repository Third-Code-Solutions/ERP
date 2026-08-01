#!/usr/bin/env node

/**
 * Read-only audit-chain recovery planner.
 *
 * Required environment:
 *   DATABASE_URL
 *   AUDIT_RECOVERY_TENANT_ID
 *
 * The report contains only opaque tenant references, counts, timestamps, and
 * system event labels. It never prints entity IDs or business values and never
 * changes database state.
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAuditRecoveryBlockers,
  isUuid,
  opaqueRef,
} from './lib/audit-recovery-plan.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const requireClear = process.argv.includes('--require-clear')
const databaseUrl = process.env.DATABASE_URL
const tenantId = process.env.AUDIT_RECOVERY_TENANT_ID

function isoOrNull(value) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

function dayOrNull(value) {
  return isoOrNull(value)?.slice(0, 10) ?? null
}

const missing = [
  ['DATABASE_URL', databaseUrl],
  ['AUDIT_RECOVERY_TENANT_ID', tenantId],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`Missing required environment: ${missing.join(', ')}`)
  process.exit(1)
}

if (!isUuid(tenantId)) {
  console.error('AUDIT_RECOVERY_TENANT_ID must be a canonical UUID')
  process.exit(1)
}

const requireFromDatabasePackage = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

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
      const [audit] = await transaction`
        with tenant_chain as (
          select
            a.id,
            a.created_at,
            a.entity_type,
            a.action,
            a.prev_hash,
            a.hash,
            lag(a.hash) over (
              partition by a.tenant_id
              order by a.id
            ) as expected_prev_hash,
            encode(
              extensions.digest(
                a.prev_hash
                  || a.entity_type
                  || a.entity_id::text
                  || a.action
                  || a.created_at::text,
                'sha256'
              ),
              'hex'
            ) as expected_hash
          from public.audit_log a
          where a.tenant_id = ${tenantId}::uuid
        )
        select
          count(*)::int as rows,
          min(created_at) as first_created_at,
          max(created_at) as last_created_at,
          count(*) filter (
            where case
              when expected_prev_hash is null
                then prev_hash is distinct from 'genesis'
              else prev_hash is distinct from expected_prev_hash
            end
          )::int as link_mismatches,
          count(*) filter (
            where hash is distinct from expected_hash
          )::int as hash_mismatches,
          count(*) filter (
            where
              case
                when expected_prev_hash is null
                  then prev_hash is distinct from 'genesis'
                else prev_hash is distinct from expected_prev_hash
              end
              and hash is distinct from expected_hash
          )::int as both_mismatches
        from tenant_chain
      `
      const byDay = await transaction`
        with tenant_chain as (
          select
            a.created_at::date as day,
            a.entity_type,
            a.action,
            a.prev_hash,
            a.hash,
            lag(a.hash) over (
              partition by a.tenant_id
              order by a.id
            ) as expected_prev_hash,
            encode(
              extensions.digest(
                a.prev_hash
                  || a.entity_type
                  || a.entity_id::text
                  || a.action
                  || a.created_at::text,
                'sha256'
              ),
              'hex'
            ) as expected_hash
          from public.audit_log a
          where a.tenant_id = ${tenantId}::uuid
        )
        select
          day,
          count(*)::int as rows,
          count(*) filter (
            where case
              when expected_prev_hash is null
                then prev_hash is distinct from 'genesis'
              else prev_hash is distinct from expected_prev_hash
            end
          )::int as link_bad,
          count(*) filter (
            where hash is distinct from expected_hash
          )::int as hash_bad
        from tenant_chain
        group by day
        order by day asc
      `
      const byEntity = await transaction`
        with tenant_chain as (
          select
            a.entity_type,
            a.action,
            a.prev_hash,
            a.hash,
            a.entity_id,
            a.created_at,
            lag(a.hash) over (
              partition by a.tenant_id
              order by a.id
            ) as expected_prev_hash,
            encode(
              extensions.digest(
                a.prev_hash
                  || a.entity_type
                  || a.entity_id::text
                  || a.action
                  || a.created_at::text,
                'sha256'
              ),
              'hex'
            ) as expected_hash
          from public.audit_log a
          where a.tenant_id = ${tenantId}::uuid
        )
        select
          entity_type,
          action,
          count(*)::int as rows,
          count(*) filter (
            where case
              when expected_prev_hash is null
                then prev_hash is distinct from 'genesis'
              else prev_hash is distinct from expected_prev_hash
            end
          )::int as link_bad,
          count(*) filter (
            where hash is distinct from expected_hash
          )::int as hash_bad
        from tenant_chain
        group by entity_type, action
        order by hash_bad desc, rows desc, entity_type, action
      `
      const [controls] = await transaction`
        select
          coalesce((
            select
              function.prosecdef
              and function.proconfig @> array[
                'search_path=public, auth, extensions'
              ]::text[]
              and pg_catalog.pg_get_functiondef(function.oid)
                ilike '%pg_advisory_xact_lock%'
              and pg_catalog.pg_get_functiondef(function.oid)
                ilike '%v_created_at%'
            from pg_catalog.pg_proc function
            join pg_catalog.pg_namespace namespace
              on namespace.oid = function.pronamespace
            where namespace.nspname = 'public'
              and function.proname = 'audit_log_trigger'
              and pg_catalog.pg_get_function_identity_arguments(
                function.oid
              ) = ''
          ), false) as audit_function_hardened,
          coalesce((
            select
              not pg_catalog.has_function_privilege(
                'anon', function.oid, 'EXECUTE'
              )
              and not pg_catalog.has_function_privilege(
                'authenticated', function.oid, 'EXECUTE'
              )
            from pg_catalog.pg_proc function
            join pg_catalog.pg_namespace namespace
              on namespace.oid = function.pronamespace
            where namespace.nspname = 'public'
              and function.proname = 'audit_log_trigger'
              and pg_catalog.pg_get_function_identity_arguments(
                function.oid
              ) = ''
          ), false) as audit_function_not_public
      `

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
          rows: Number(audit?.rows ?? 0),
          firstCreatedAt: isoOrNull(audit?.first_created_at),
          lastCreatedAt: isoOrNull(audit?.last_created_at),
          linkMismatches: Number(audit?.link_mismatches ?? 0),
          hashMismatches: Number(audit?.hash_mismatches ?? 0),
          bothMismatches: Number(audit?.both_mismatches ?? 0),
          byDay: byDay.map((row) => ({
            day: dayOrNull(row.day),
            rows: Number(row.rows ?? 0),
            linkBad: Number(row.link_bad ?? 0),
            hashBad: Number(row.hash_bad ?? 0),
          })),
          byEntity: byEntity.map((row) => ({
            entityType: row.entity_type,
            action: row.action,
            rows: Number(row.rows ?? 0),
            linkBad: Number(row.link_bad ?? 0),
            hashBad: Number(row.hash_bad ?? 0),
          })),
        },
        controls: {
          auditFunctionHardened: Boolean(
            controls?.audit_function_hardened
          ),
          auditFunctionNotPublic: Boolean(
            controls?.audit_function_not_public
          ),
        },
      }

      return {
        ...baseReport,
        blockers: buildAuditRecoveryBlockers(baseReport),
      }
    }
  )

  const status = report.blockers.length === 0 ? 'clear' : 'review_required'
  const output = { ...report, status }

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('Third Code ERP audit recovery plan (READ ONLY)')
    console.log(`Status: ${status}`)
    console.log(
      `Target ref: tenant=${report.target.tenantRef}; PostgreSQL ${report.database.postgresMajor}; timezone=${report.database.timezone}`
    )
    console.log(
      `Audit rows: ${report.audit.rows}; link mismatches: ${report.audit.linkMismatches}; hash mismatches: ${report.audit.hashMismatches}`
    )
    if (report.blockers.length > 0) {
      console.log('Blockers:')
      for (const blocker of report.blockers) console.log(`- ${blocker}`)
    }
    console.log('No business values or identifiers were printed.')
    console.log('No database state was changed.')
  }

  if (requireClear && report.blockers.length > 0) process.exitCode = 2
} catch (error) {
  console.error(
    `Audit recovery planning failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
