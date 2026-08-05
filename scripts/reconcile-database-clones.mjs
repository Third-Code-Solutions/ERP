#!/usr/bin/env node

/**
 * Read-only reconciliation between a clean disposable replay and a hosted
 * clone. Both connections execute one PostgreSQL READ ONLY transaction.
 *
 * Required environment:
 *   DATABASE_URL          hosted/target connection
 *   REPLAY_DATABASE_URL   disposable PostgreSQL 17 replay connection
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/reconcile-database-clones.mjs
 *   node --env-file=apps/web/.env.local scripts/reconcile-database-clones.mjs --json
 */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diffRecords,
  hasDrift,
  summarizeDiff,
} from './lib/database-reconciliation.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const requireFromDatabasePackage = createRequire(
  resolve(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const jsonOutput = process.argv.includes('--json')
const hostedUrl = process.env.DATABASE_URL?.trim()
const replayUrl = process.env.REPLAY_DATABASE_URL?.trim()

const financialCandidates = {
  journal_lines: ['debit_cents', 'credit_cents'],
  stock_ledger_entries: ['quantity_delta_micros', 'value_delta_cents'],
  invoices: [
    'subtotal_cents',
    'retention_cents',
    'vat_cents',
    'withholding_tax_cents',
    'net_amount_cents',
  ],
  supplier_bills: ['subtotal_cents', 'vat_cents', 'total_cents', 'net_amount_cents'],
  cash_transactions: ['amount_cents', 'total_cents'],
}

if (!hostedUrl || !replayUrl) {
  console.error(
    'DATABASE_URL and REPLAY_DATABASE_URL are required; no reconciliation was attempted'
  )
  process.exit(1)
}

function connectionIdentity(value) {
  const url = new URL(value)
  return `${url.protocol}//${url.hostname}:${url.port || '(default)'}${url.pathname}`
}

if (connectionIdentity(hostedUrl) === connectionIdentity(replayUrl)) {
  console.error('Hosted and replay connections resolve to the same database; refusing to run')
  process.exit(1)
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function asText(value) {
  return value === null || value === undefined ? null : String(value)
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readSnapshot(label, databaseUrl) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
    idle_timeout: 10,
  })

  try {
    return await sql.begin(async (tx) => {
      await tx.unsafe('set transaction read only')
      const [version] = await tx.unsafe(
        'select current_setting(\'server_version_num\') as server_version_num'
      )
      const ledger = await tx.unsafe(
        `select version::text, name::text
           from supabase_migrations.schema_migrations
          order by version`
      )
      const relations = await tx.unsafe(
        `select c.relname::text as name,
                c.relkind::text as kind,
                c.relrowsecurity as rls,
                c.relforcerowsecurity as force_rls
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind in ('r', 'p', 'v', 'm')
          order by c.relname`
      )
      const policies = await tx.unsafe(
        `select tablename::text,
                policyname::text,
                permissive::text,
                roles,
                cmd::text,
                qual::text,
                with_check::text
           from pg_catalog.pg_policies
          where schemaname = 'public'
          order by tablename, policyname`
      )
      const indexes = await tx.unsafe(
        `select tablename::text, indexname::text, indexdef::text
           from pg_catalog.pg_indexes
          where schemaname = 'public'
          order by tablename, indexname`
      )
      const triggers = await tx.unsafe(
        `select c.relname::text as tablename,
                t.tgname::text as trigger_name,
                t.tgenabled::text as enabled,
                pg_catalog.pg_get_triggerdef(t.oid)::text as definition
           from pg_catalog.pg_trigger t
           join pg_catalog.pg_class c on c.oid = t.tgrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and not t.tgisinternal
          order by c.relname, t.tgname`
      )
      const functions = await tx.unsafe(
        `select p.proname::text as name,
                pg_catalog.pg_get_function_identity_arguments(p.oid)::text as identity_arguments,
                p.prokind::text as kind,
                p.prosecdef as security_definer,
                p.proconfig
           from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
          order by p.proname, identity_arguments`
      )
      const tableGrants = await tx.unsafe(
        `select grantee::text, table_name::text, privilege_type::text
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated', 'service_role', 'public')
          order by grantee, table_name, privilege_type`
      )
      const routineGrants = await tx.unsafe(
        `select grantee::text, routine_name::text, specific_name::text,
                privilege_type::text
           from information_schema.routine_privileges
          where routine_schema = 'public'
            and grantee in ('anon', 'authenticated', 'service_role', 'public')
          order by grantee, routine_name, specific_name, privilege_type`
      )
      const columns = await tx.unsafe(
        `select table_name::text, column_name::text
           from information_schema.columns
          where table_schema = 'public'
          order by table_name, ordinal_position`
      )
      const columnsByTable = new Map()
      for (const row of columns) {
        const table = columnsByTable.get(row.table_name) ?? new Set()
        table.add(row.column_name)
        columnsByTable.set(row.table_name, table)
      }

      const baseTables = relations.filter((row) => row.kind === 'r' || row.kind === 'p')
      const counts = []
      for (const table of baseTables) {
        const tableName = table.name
        const identifier = quoteIdentifier(tableName)
        const hasTenant = columnsByTable.get(tableName)?.has('tenant_id') ?? false
        try {
          const [row] = await tx.unsafe(
            `select count(*)::text as row_count,
                    ${hasTenant ? 'count(distinct tenant_id)::text' : 'null::text'} as tenant_count
               from public.${identifier}`
          )
          counts.push({
            table: tableName,
            row_count: asText(row?.row_count),
            tenant_count: asText(row?.tenant_count),
          })
        } catch (error) {
          counts.push({ table: tableName, error: safeError(error) })
        }
      }

      const financialTotals = []
      for (const [tableName, candidates] of Object.entries(financialCandidates)) {
        const tableColumns = columnsByTable.get(tableName)
        if (!tableColumns) continue
        for (const columnName of candidates) {
          if (!tableColumns.has(columnName)) continue
          try {
            const [row] = await tx.unsafe(
              `select count(*)::text as row_count,
                      coalesce(sum(${quoteIdentifier(columnName)}), 0)::text as total
                 from public.${quoteIdentifier(tableName)}`
            )
            financialTotals.push({
              table: tableName,
              column: columnName,
              row_count: asText(row?.row_count),
              total: asText(row?.total),
            })
          } catch (error) {
            financialTotals.push({
              table: tableName,
              column: columnName,
              error: safeError(error),
            })
          }
        }
      }

      let audit = null
      if (columnsByTable.has('audit_log')) {
        const [row] = await tx.unsafe(
          `select count(*)::text as row_count,
                  count(distinct tenant_id)::text as tenant_count,
                  min(id)::text as first_id,
                  max(id)::text as last_id,
                  (select hash from public.audit_log order by id asc limit 1) as first_hash,
                  (select hash from public.audit_log order by id desc limit 1) as last_hash
             from public.audit_log`
        )
        audit = {
          row_count: asText(row?.row_count),
          tenant_count: asText(row?.tenant_count),
          first_id: asText(row?.first_id),
          last_id: asText(row?.last_id),
          first_hash: asText(row?.first_hash),
          last_hash: asText(row?.last_hash),
        }
      }

      return {
        label,
        postgresMajor: Math.floor(Number(version?.server_version_num ?? 0) / 10_000),
        ledger,
        catalog: {
          relations,
          policies,
          indexes,
          triggers,
          functions,
          tableGrants,
          routineGrants,
        },
        counts,
        financialTotals,
        audit,
      }
    })
  } finally {
    await sql.end({ timeout: 2 })
  }
}

function compareCategory(leftRows, rightRows, fields) {
  return summarizeDiff(diffRecords(leftRows, rightRows, fields))
}

function compareSnapshots(replay, hosted) {
  const catalog = {
    relations: compareCategory(replay.catalog.relations, hosted.catalog.relations, ['name']),
    policies: compareCategory(replay.catalog.policies, hosted.catalog.policies, ['tablename', 'policyname']),
    indexes: compareCategory(replay.catalog.indexes, hosted.catalog.indexes, ['tablename', 'indexname']),
    triggers: compareCategory(replay.catalog.triggers, hosted.catalog.triggers, ['tablename', 'trigger_name']),
    functions: compareCategory(replay.catalog.functions, hosted.catalog.functions, ['name', 'identity_arguments']),
    tableGrants: compareCategory(replay.catalog.tableGrants, hosted.catalog.tableGrants, ['grantee', 'table_name', 'privilege_type']),
    routineGrants: compareCategory(replay.catalog.routineGrants, hosted.catalog.routineGrants, ['grantee', 'routine_name', 'specific_name', 'privilege_type']),
  }
  const data = compareCategory(replay.counts, hosted.counts, ['table'])
  const financial = compareCategory(replay.financialTotals, hosted.financialTotals, ['table', 'column'])
  const audit = compareCategory(
    replay.audit ? [replay.audit] : [],
    hosted.audit ? [hosted.audit] : [],
    ['row_count']
  )
  const ledger = compareCategory(replay.ledger, hosted.ledger, ['version'])
  const versionMismatch = replay.postgresMajor !== hosted.postgresMajor
  const drift = [
    ledger,
    ...Object.values(catalog),
    data,
    financial,
    audit,
  ].some((item) => hasDrift(item))

  return {
    status: drift || versionMismatch ? 'reconcile_required' : 'reconciled',
    postgresMajor: {
      replay: replay.postgresMajor,
      hosted: hosted.postgresMajor,
      mismatch: versionMismatch,
    },
    ledger,
    catalog,
    data,
    financial,
    audit,
    snapshots: {
      replay: {
        counts: replay.counts,
        financialTotals: replay.financialTotals,
        audit: replay.audit,
      },
      hosted: {
        counts: hosted.counts,
        financialTotals: hosted.financialTotals,
        audit: hosted.audit,
      },
    },
  }
}

try {
  const [replay, hosted] = await Promise.all([
    readSnapshot('replay', replayUrl),
    readSnapshot('hosted', hostedUrl),
  ])
  const report = {
    mode: 'read_only',
    generatedAt: new Date().toISOString(),
    comparison: compareSnapshots(replay, hosted),
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const result = report.comparison
    console.log('Third Code ERP clone reconciliation (READ ONLY)')
    console.log(`Status: ${result.status}`)
    console.log(`PostgreSQL major: replay=${result.postgresMajor.replay}; hosted=${result.postgresMajor.hosted}`)
    console.log(`Migration ledger drift: missing-in-hosted=${result.ledger.missingInRight}; extra-in-hosted=${result.ledger.extraInRight}; changed=${result.ledger.changed}`)
    for (const [name, diff] of Object.entries(result.catalog)) {
      console.log(`Catalog ${name}: missing-in-hosted=${diff.missingInRight}; extra-in-hosted=${diff.extraInRight}; changed=${diff.changed}`)
    }
    console.log(`Data count drift: missing-in-hosted=${result.data.missingInRight}; extra-in-hosted=${result.data.extraInRight}; changed=${result.data.changed}`)
    console.log(`Financial total drift: missing-in-hosted=${result.financial.missingInRight}; extra-in-hosted=${result.financial.extraInRight}; changed=${result.financial.changed}`)
    console.log(`Audit summary drift: missing-in-hosted=${result.audit.missingInRight}; extra-in-hosted=${result.audit.extraInRight}; changed=${result.audit.changed}`)
    console.log('No write SQL was executed.')
  }

  if (report.comparison.status !== 'reconciled') process.exitCode = 1
} catch (error) {
  console.error(`Database clone reconciliation failed: ${safeError(error)}`)
  process.exitCode = 1
}
