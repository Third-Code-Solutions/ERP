#!/usr/bin/env node

/**
 * Read-only Purchase Order duplicate-remediation planner.
 *
 * The report intentionally omits PO numbers, entity UUIDs, money, notes, and
 * other business values. It emits stable opaque references plus counts,
 * timestamps, statuses, and a deterministic review order. It never writes.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/plan-purchase-order-duplicates.mjs
 *   node scripts/plan-purchase-order-duplicates.mjs --json --require-clear
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildPurchaseOrderDuplicateBlockers,
  opaqueRef,
  parsePositiveLimit,
  statusCounts,
} from './lib/purchase-order-duplicate-plan.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const requireClear = process.argv.includes('--require-clear')
const databaseUrl = process.env.DATABASE_URL

function optionValue(name) {
  const prefix = `--${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

function isoOrNull(value) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

if (!databaseUrl) {
  console.error('Missing required environment: DATABASE_URL')
  process.exit(1)
}

let maxGroups
let maxRecords
try {
  maxGroups = parsePositiveLimit(
    optionValue('max-groups'),
    25,
    '--max-groups'
  )
  maxRecords = parsePositiveLimit(
    optionValue('max-records'),
    100,
    '--max-records'
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
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
      const [totals] = await transaction`
        with duplicate_groups as (
          select tenant_id, po_number, count(*)::int as record_count
          from public.purchase_orders
          group by tenant_id, po_number
          having count(*) > 1
        )
        select
          count(*)::int as groups,
          coalesce(sum(record_count), 0)::int as records
        from duplicate_groups
      `
      const groups = await transaction`
        select
          tenant_id,
          po_number,
          count(*)::int as record_count,
          min(created_at) as first_created_at,
          max(created_at) as last_created_at,
          count(distinct project_id)::int as project_count
        from public.purchase_orders
        group by tenant_id, po_number
        having count(*) > 1
        order by min(created_at), tenant_id, po_number
        limit ${maxGroups}
      `

      const groupReports = []
      for (const group of groups) {
        const records = await transaction`
          select id, project_id, vendor_id, status::text as status, created_at
          from public.purchase_orders
          where tenant_id = ${group.tenant_id}::uuid
            and po_number = ${group.po_number}
          order by created_at, id
          limit ${maxRecords}
        `
        const recordCount = Number(group.record_count ?? 0)
        groupReports.push({
          tenantRef: opaqueRef(group.tenant_id),
          groupRef: opaqueRef(`${group.tenant_id}:${group.po_number}`),
          recordCount,
          recordsOmitted: Math.max(0, recordCount - records.length),
          firstCreatedAt: isoOrNull(group.first_created_at),
          lastCreatedAt: isoOrNull(group.last_created_at),
          projectCount: Number(group.project_count ?? 0),
          statusCounts: statusCounts(records),
          reviewOrder: records.map((record, index) => ({
            ordinal: index + 1,
            recordRef: opaqueRef(record.id),
            projectRef: opaqueRef(record.project_id),
            vendorRef: record.vendor_id ? opaqueRef(record.vendor_id) : null,
            status: record.status,
            createdAt: isoOrNull(record.created_at),
            reviewNote:
              index === 0
                ? 'earliest-created candidate; owner review required'
                : 'later-created duplicate; owner review required',
          })),
        })
      }

      const duplicateGroups = Number(totals?.groups ?? 0)
      const duplicateRecords = Number(totals?.records ?? 0)
      const baseReport = {
        mode: 'read_only',
        generatedAt: new Date().toISOString(),
        database: {
          postgresMajor: Math.floor(
            Number(server?.server_version_num ?? 0) / 10_000
          ),
          timezone: server?.timezone ?? null,
        },
        limits: {
          maxGroups,
          maxRecords,
        },
        duplicates: {
          groups: duplicateGroups,
          records: duplicateRecords,
          returnedGroups: groupReports.length,
          truncated: groupReports.length < duplicateGroups,
          groupReports,
        },
      }

      return {
        ...baseReport,
        blockers: buildPurchaseOrderDuplicateBlockers(baseReport),
      }
    }
  )

  const status = report.blockers.length === 0 ? 'clear' : 'review_required'
  const output = { ...report, status }

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('Third Code ERP Purchase Order duplicate plan (READ ONLY)')
    console.log(`Status: ${status}`)
    console.log(
      `PostgreSQL ${report.database.postgresMajor}; duplicate groups: ${report.duplicates.groups}; records: ${report.duplicates.records}`
    )
    if (report.blockers.length > 0) {
      console.log('Blockers:')
      for (const blocker of report.blockers) console.log(`- ${blocker}`)
    }
    for (const group of report.duplicates.groupReports) {
      console.log(
        `- group=${group.groupRef}; tenant=${group.tenantRef}; records=${group.recordCount}; review candidates=${group.reviewOrder.length}`
      )
    }
    console.log('No PO numbers, business values, or entity identifiers were printed.')
    console.log('No database state was changed.')
  }

  if (requireClear && report.blockers.length > 0) process.exitCode = 2
} catch (error) {
  console.error(
    `Purchase Order duplicate planning failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}

