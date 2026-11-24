#!/usr/bin/env node
/**
 * Import a tenant's material items (stock catalog) from a CSV file.
 *
 * Header: code,description,unit[,tracked]   (tracked: yes/no, blank = no)
 * Usage (dry run, the default; prints what would be inserted and why rows fail):
 *   DATABASE_URL=... node scripts/import-material-items.mjs --tenant-id <uuid> --csv items.csv
 * Write the items:
 *   DATABASE_URL=... node scripts/import-material-items.mjs --tenant-id <uuid> --csv items.csv --apply
 * Options:
 *   --actor-user-id <uuid>  default: the tenant's earliest active owner/admin
 *
 * One transaction. Items are only inserted (ON CONFLICT DO NOTHING); an existing
 * code is left exactly as it is. The unit must already be a unit of measure or a
 * unit alias of the tenant (run bootstrap-trial-tenant.mjs first): the importer
 * never creates units, because unit equivalence is the company's data. Any row
 * error refuses the whole run (exit code 3, nothing written). Each inserted item
 * gets a hash-chained audit_log entry; if a planned item cannot be inserted the
 * whole run rolls back (exit code 2).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  formatImportReport,
  materialItemAuditHash,
  parseImportArgs,
  parseMaterialItemsCsv,
  planMaterialItemsImport,
} from './lib/material-items-import.mjs'
import {
  readUnitAliases,
  resolveActor,
  stampActor,
} from './lib/tenant-script-db.mjs'

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url)
)

const EXIT_FAILED = 2
const EXIT_ROW_ERRORS = 3

class RowErrors extends Error {}

async function run(tx, options, rows, csvErrors) {
  const { tenantId, apply } = options
  if (apply) {
    // Serialises concurrent imports for the same tenant.
    await tx`select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${`import-material-items:${tenantId}`}::text, 0))`
  }
  const [tenant] = await tx`
    select id::text as id, name from public.tenants where id = ${tenantId}::uuid
  `
  if (!tenant) throw new Error('Tenant not found; refusing to run.')

  const actor = await resolveActor(tx, options)
  const [items, unitsOfMeasure, unitAliases] = await Promise.all([
    tx`select code from public.material_items where tenant_id = ${tenantId}::uuid`,
    tx`select code from public.units_of_measure where tenant_id = ${tenantId}::uuid`,
    readUnitAliases(tx, tenantId),
  ])
  const plan = planMaterialItemsImport(rows, {
    itemCodes: items.map((row) => row.code),
    unitsOfMeasure,
    unitAliases,
  })
  plan.errors.unshift(...csvErrors)
  for (const line of formatImportReport(plan, {
    tenantId,
    tenantName: tenant.name,
    actorUserId: actor.id,
    actorSource: actor.source,
    apply,
  })) {
    console.log(line)
  }

  if (plan.errors.length > 0) throw new RowErrors('Row errors found; nothing was written.')
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these items.')
    return
  }

  await stampActor(tx, actor.id)
  // The app's audit writer takes the same lock, so the tenant's hash chain stays linear.
  await tx`select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(${`audit_log:${tenantId}`}::text, 0))`
  const [lastAudit] = await tx`
    select hash from public.audit_log
     where tenant_id = ${tenantId}::uuid
     order by id desc
     limit 1
  `
  let prevHash = lastAudit?.hash ?? 'genesis'
  const skipped = []
  for (const row of plan.insert) {
    const [created] = await tx`
      insert into public.material_items
        (tenant_id, code, description, unit, base_uom_id, inventory_tracked, created_by)
      select ${tenantId}::uuid, ${row.code}, ${row.description}, uom.code, uom.id,
             ${row.tracked}::boolean, ${actor.id}::uuid
        from public.units_of_measure uom
       where uom.tenant_id = ${tenantId}::uuid and uom.code = ${row.unit}
      on conflict do nothing
      returning id::text as id, unit
    `
    if (!created) {
      skipped.push(row.code)
      continue
    }
    // One audit entry per item, as the app's material item create writes.
    const createdAt = new Date()
    const hash = materialItemAuditHash(prevHash, created.id, createdAt)
    const diff = {
      code: row.code,
      description: row.description,
      unit: created.unit,
      inventory_tracked: row.tracked,
      source: 'import-material-items',
    }
    await tx`
      insert into public.audit_log
        (tenant_id, actor_id, entity_type, entity_id, action, diff, prev_hash, hash, created_at)
      values (${tenantId}::uuid, ${actor.id}::uuid, 'material_item', ${created.id}::uuid, 'create',
              ${tx.json(diff)}, ${prevHash}, ${hash}, ${createdAt})
    `
    prevHash = hash
  }
  if (skipped.length > 0) {
    // Created by someone else since the plan was read, or the unit is gone: roll back.
    throw new Error(
      `${skipped.length} item(s) could not be inserted: ${skipped.join(', ')}. ` +
        'Nothing was written; run the dry run again.'
    )
  }
  console.log(`\nInserted: ${plan.insert.length} item(s), each with an audit_log entry`)
}

async function main() {
  let options
  let parsed
  try {
    options = parseImportArgs(process.argv.slice(2))
    parsed = parseMaterialItemsCsv(readFileSync(options.csvPath, 'utf8'))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required in the environment.')
    process.exit(1)
  }

  const postgres = requireFromDatabasePackage('postgres')
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  })
  try {
    await sql.begin(options.apply ? 'read write' : 'read only', (tx) =>
      run(tx, options, parsed.rows, parsed.errors)
    )
  } catch (error) {
    const message = String(error?.message ?? error).replaceAll(databaseUrl, '[redacted]')
    console.error(`import-material-items: ${message}`)
    process.exitCode = error instanceof RowErrors ? EXIT_ROW_ERRORS : EXIT_FAILED
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
