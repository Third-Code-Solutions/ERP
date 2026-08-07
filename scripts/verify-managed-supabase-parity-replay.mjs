#!/usr/bin/env node

/**
 * Read-only verification of an isolated managed-Supabase snapshot replay.
 * Remote hosts are rejected. This script never applies migrations or repairs
 * data; it only verifies a localhost clone after a separately controlled run.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManagedSupabaseParityPlan } from './lib/managed-supabase-parity-plan.mjs'
import {
  analyzeManagedSupabaseParityReplay,
  describeLocalReplayTarget,
} from './lib/managed-supabase-parity-replay.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const databaseUrl = process.env.DATABASE_URL
const target = describeLocalReplayTarget(databaseUrl)

if (!target.ok) {
  console.error(target.error)
  process.exit(1)
}

const migrationDirectory = join(repoRoot, 'supabase', 'migrations')
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const expectedVersions = migrationFiles.map((name) => name.slice(0, 14))
const plan = JSON.parse(
  readFileSync(
    join(repoRoot, 'docs', 'operations', 'managed-supabase-parity-plan.json'),
    'utf8'
  )
)
const planValidation = validateManagedSupabaseParityPlan(plan, migrationFiles)

if (!planValidation.ok) {
  console.error(planValidation.errors.join('\n'))
  process.exit(1)
}

const requireFromDatabasePackage = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 5,
  idle_timeout: 5,
})

try {
  const [server] = await sql.unsafe('show server_version_num')
  const appliedRows = await sql.unsafe(
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`
  )
  const [facts] = await sql.unsafe(
    `select
       (
         select count(*)::int
           from (
             select tenant_id, po_number
               from public.purchase_orders
              group by tenant_id, po_number
             having count(*) > 1
           ) duplicate_groups
       ) as duplicate_purchase_order_group_count,
       (
         select count(*)::int
           from pg_class table_info
           join pg_namespace namespace_info
             on namespace_info.oid = table_info.relnamespace
          where namespace_info.nspname = 'public'
            and table_info.relkind in ('r', 'p')
            and not table_info.relrowsecurity
            and exists (
              select 1
                from information_schema.columns column_info
               where column_info.table_schema = 'public'
                 and column_info.table_name = table_info.relname
                 and column_info.column_name = 'tenant_id'
            )
       ) as tenant_tables_without_rls,
       to_regclass('public.customer_invoice_draft_create_requests') is not null
         as customer_invoice_draft_create_requests,
       to_regclass('public.user_role_assignment_requests') is not null
         as user_role_assignment_requests,
       to_regclass('auth.users') is not null as auth_users,
       to_regclass('storage.objects') is not null as storage_objects,
       to_regtype('public.vector') is not null as vector_type,
       has_function_privilege(
         'anon',
         'public.auth_tenant_id()',
         'execute'
       ) as anon_auth_tenant_execute`
  )

  const report = analyzeManagedSupabaseParityReplay({
    expectedVersions,
    appliedVersions: appliedRows.map((row) => row.version),
    snapshotAppliedCount: plan.snapshot.appliedCount,
    snapshotPendingCount: plan.snapshot.pendingCount,
    postgresMajor: Math.floor(Number(server.server_version_num) / 10_000),
    duplicatePurchaseOrderGroupCount:
      facts.duplicate_purchase_order_group_count,
    tenantTablesWithoutRls: facts.tenant_tables_without_rls,
    requiredTables: {
      customer_invoice_draft_create_requests:
        facts.customer_invoice_draft_create_requests,
      user_role_assignment_requests: facts.user_role_assignment_requests,
    },
    managedSurfaces: {
      auth_users: facts.auth_users,
      storage_objects: facts.storage_objects,
      vector_type: facts.vector_type,
    },
    anonAuthTenantExecute: facts.anon_auth_tenant_execute,
    mappingMode: process.env.ERP_PARITY_REPLAY_MAPPING_MODE,
  })

  console.log(
    JSON.stringify(
      {
        mode: 'local_read_only_verification',
        target,
        ...report,
      },
      null,
      2
    )
  )
  if (!report.ok) process.exitCode = 1
} catch (error) {
  console.error(
    `Managed parity replay verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
