#!/usr/bin/env node
/**
 * Bootstrap the finance and inventory prerequisites of a new trial tenant:
 * chart of accounts (with every system key the app posts against), one open
 * fiscal period, cash accounts, units of measure, unit aliases, one warehouse
 * and generic cost codes.
 *
 * Usage (dry run, the default; prints what would be inserted and what exists):
 *   DATABASE_URL=... node scripts/bootstrap-trial-tenant.mjs --tenant-id <uuid>
 * Write the changes:
 *   DATABASE_URL=... node scripts/bootstrap-trial-tenant.mjs --tenant-id <uuid> --apply
 * Options:
 *   --fiscal-year <yyyy>    default: current year in Asia/Manila
 *   --actor-user-id <uuid>  default: the tenant's earliest active owner/admin
 *   --warehouse <code>      warehouse to create (default MAIN, created by the actor).
 *                           Without it, a tenant that already has a warehouse gets none.
 *
 * Everything runs in one transaction. Rows are only ever inserted (ON CONFLICT
 * DO NOTHING); existing rows are never updated or deleted, so re-running is safe.
 * The run refuses if the tenant does not exist, or if an existing account blocks
 * a required system key (exit code 3, nothing written). Unit aliases are skipped
 * (and reported) until migration 20261118100000 has created the unit_aliases table.
 */
import { createRequire } from 'node:module'
import {
  buildBootstrapPlan,
  diffBootstrapPlan,
  formatBootstrapReport,
  parseBootstrapArgs,
} from './lib/trial-tenant-bootstrap.mjs'
import {
  readUnitAliases,
  resolveActor,
  stampActor,
} from './lib/tenant-script-db.mjs'

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url)
)

const EXIT_FAILED = 2
const EXIT_CONFLICTS = 3

class ConflictError extends Error {}

async function readExisting(tx, tenantId) {
  const [
    ledgerAccounts,
    fiscalPeriods,
    cashAccounts,
    unitsOfMeasure,
    costCodes,
    warehouses,
    unitAliases,
  ] = await Promise.all([
    tx`select code, system_key from public.ledger_accounts where tenant_id = ${tenantId}::uuid`,
    tx`select name, starts_on::text as starts_on, ends_on::text as ends_on
         from public.fiscal_periods where tenant_id = ${tenantId}::uuid`,
    tx`select cash.name, ledger.code as ledger_code
         from public.cash_accounts cash
         join public.ledger_accounts ledger
           on ledger.id = cash.ledger_account_id and ledger.tenant_id = cash.tenant_id
        where cash.tenant_id = ${tenantId}::uuid`,
    tx`select code from public.units_of_measure where tenant_id = ${tenantId}::uuid`,
    tx`select code from public.cost_codes where tenant_id = ${tenantId}::uuid`,
    tx`select code from public.warehouses where tenant_id = ${tenantId}::uuid`,
    readUnitAliases(tx, tenantId),
  ])
  return {
    ledgerAccounts,
    fiscalPeriods,
    cashAccounts,
    unitsOfMeasure,
    costCodes,
    warehouses,
    unitAliases,
  }
}

async function insertRows(tx, { tenantId, actorId }, diff) {
  const counts = {
    ledgerAccounts: 0,
    fiscalPeriod: 0,
    cashAccounts: 0,
    unitsOfMeasure: 0,
    unitAliases: 0,
    warehouse: 0,
    costCodes: 0,
  }
  const count = (name, rows) => {
    counts[name] += rows.length
  }

  for (const row of diff.ledgerAccounts.insert) {
    count('ledgerAccounts', await tx`
      insert into public.ledger_accounts
        (tenant_id, code, name, account_type, normal_balance, system_key, created_by)
      values
        (${tenantId}::uuid, ${row.code}, ${row.name},
         ${row.account_type}::public.ledger_account_type,
         ${row.normal_balance}::public.normal_balance,
         ${row.system_key}, ${actorId}::uuid)
      on conflict do nothing
      returning id
    `)
  }
  for (const row of diff.fiscalPeriod.insert) {
    count('fiscalPeriod', await tx`
      insert into public.fiscal_periods (tenant_id, name, starts_on, ends_on, created_by)
      values (${tenantId}::uuid, ${row.name}, ${row.starts_on}::date, ${row.ends_on}::date, ${actorId}::uuid)
      on conflict do nothing
      returning id
    `)
  }
  for (const row of diff.cashAccounts.insert) {
    count('cashAccounts', await tx`
      insert into public.cash_accounts
        (tenant_id, ledger_account_id, name, account_kind, currency, created_by)
      select ${tenantId}::uuid, ledger.id, ${row.name},
             ${row.account_kind}::public.cash_account_kind, 'PHP', ${actorId}::uuid
        from public.ledger_accounts ledger
       where ledger.tenant_id = ${tenantId}::uuid and ledger.code = ${row.ledger_code}
      on conflict do nothing
      returning id
    `)
  }
  for (const row of diff.unitsOfMeasure.insert) {
    count('unitsOfMeasure', await tx`
      insert into public.units_of_measure (tenant_id, code, name, decimal_places, created_by)
      values (${tenantId}::uuid, ${row.code}, ${row.name}, ${row.decimal_places}::int, ${actorId}::uuid)
      on conflict do nothing
      returning id
    `)
  }
  // After the units: an alias points at a unit of the same tenant.
  for (const row of diff.unitAliases.insert) {
    count('unitAliases', await tx`
      insert into public.unit_aliases (tenant_id, alias, uom_id, created_by)
      select ${tenantId}::uuid, ${row.alias}, uom.id, ${actorId}::uuid
        from public.units_of_measure uom
       where uom.tenant_id = ${tenantId}::uuid
         and lower(uom.code) = lower(${row.uom_code})
      on conflict do nothing
      returning id
    `)
  }
  for (const row of diff.warehouse.insert) {
    count('warehouse', await tx`
      insert into public.warehouses (tenant_id, code, name, project_id, created_by)
      values (${tenantId}::uuid, ${row.code}, ${row.name}, null, ${actorId}::uuid)
      on conflict do nothing
      returning id
    `)
  }
  for (const row of diff.costCodes.insert) {
    count('costCodes', await tx`
      insert into public.cost_codes (tenant_id, code, name, category, created_by)
      values (${tenantId}::uuid, ${row.code}, ${row.name},
              ${row.category}::public.cost_category, ${actorId}::uuid)
      on conflict do nothing
      returning id
    `)
  }
  return counts
}

async function run(tx, options) {
  const { tenantId, apply } = options
  if (apply) {
    // Serialises concurrent bootstrap runs for the same tenant.
    await tx`select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${`bootstrap-trial-tenant:${tenantId}`}::text, 0))`
  }

  const [tenant] = await tx`
    select id::text as id, name from public.tenants where id = ${tenantId}::uuid
  `
  if (!tenant) throw new Error('Tenant not found; refusing to run.')

  const actor = await resolveActor(tx, options)
  const existing = await readExisting(tx, tenantId)
  const diff = diffBootstrapPlan(buildBootstrapPlan(options), existing)
  for (const line of formatBootstrapReport(diff, {
    tenantId,
    tenantName: tenant.name,
    fiscalYear: options.fiscalYear,
    actorUserId: actor.id,
    actorSource: actor.source,
    apply,
  })) {
    console.log(line)
  }

  if (diff.conflicts.length > 0) {
    throw new ConflictError('Conflicts found; nothing was written.')
  }
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these rows.')
    return
  }

  await stampActor(tx, actor.id)
  const counts = await insertRows(tx, { tenantId, actorId: actor.id }, diff)
  console.log('\nInserted:', JSON.stringify(counts))
}

async function main() {
  let options
  try {
    options = parseBootstrapArgs(process.argv.slice(2))
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
      run(tx, options)
    )
  } catch (error) {
    const message = String(error?.message ?? error).replaceAll(databaseUrl, '[redacted]')
    console.error(`bootstrap-trial-tenant: ${message}`)
    process.exitCode = error instanceof ConflictError ? EXIT_CONFLICTS : EXIT_FAILED
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
