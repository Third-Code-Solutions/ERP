#!/usr/bin/env node

/**
 * Cortex coverage backfill (docs/erp/specs/cortex-coverage.md §7).
 *
 *   DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1
 *     [--mode missing|all|scrub] [--page-size N] [--resume table:tenant[:id]] [--dry-run]
 *
 * --mode missing (default) mirrors rows that have no current node.
 * --mode all re-applies every row, so existing nodes get the new allowlisted
 *   attributes; unchanged nodes write no provenance (cortex_upsert_node).
 * --mode scrub rewrites EVERY node of each table, closed and orphaned nodes
 *   included, to the current allowlist (cortex_scrub_nodes). Run it after
 *   --mode all, and again until every table reports changed 0 and skipped 0.
 * --page-size (default 50, at most 2000) rows per call. Each call is its own
 *   short transaction over ONE tenant, so it holds one tenant's provenance and
 *   audit locks at a time.
 * --resume continues from the last RESUME line printed: one follows every
 *   committed page, and a failed run prints the page it stopped at.
 * --dry-run only counts the rows each table would process. It is read-only and
 *   takes no provenance lock.
 *
 * A row that fails is printed (FAILED-ROW table id error) and the run goes on;
 * the exit code is 1 when any row failed. Re-running is safe. DATABASE_URL
 * comes from the environment only.
 */
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Order matters: endpoints first (users, accounts, vendors) so edges resolve.
export const BATCH_TABLES = Object.freeze({
  1: Object.freeze([
    'users',
    'accounts',
    'opportunities',
    'documents',
    'vendors',
    'cost_codes',
    'material_items',
    'contacts',
    'scope_items',
    'permits',
    'variation_orders',
    'progress_claims',
    'warranty_tickets',
    'delivery_schedules',
    'rfqs',
    'contracts',
    'certificates_of_completion',
    'punchlist_items',
    'site_inspections',
    'design_files',
    'change_requests',
    'master_schedules',
    'weekly_reports',
    'pre_con_checklist_items',
    'cost_entries',
    'project_budgets',
    'stock_movements',
  ]),
})

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 2000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function parseResume(value) {
  const [table, tenant, after, extra] = String(value ?? '').toLowerCase().split(':')
  if (!table || !UUID.test(tenant ?? '') || (after && !UUID.test(after)) || extra !== undefined) {
    throw new Error('--resume must be table:tenant-uuid[:row-uuid]')
  }
  return { table, tenant, after: after || null }
}

export function resumeArg({ table, tenant, after }) {
  return `--resume ${table}:${tenant}${after ? `:${after}` : ''}`
}

export function parseArgs(argv) {
  const options = { batch: null, mode: 'missing', dryRun: false, pageSize: DEFAULT_PAGE_SIZE, resume: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--batch') options.batch = argv[++index]
    else if (arg === '--mode') options.mode = argv[++index]
    else if (arg === '--page-size') options.pageSize = Number(argv[++index])
    else if (arg === '--resume') options.resume = parseResume(argv[++index])
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Object.hasOwn(BATCH_TABLES, options.batch ?? '')) {
    throw new Error(`--batch must be one of: ${Object.keys(BATCH_TABLES).join(', ')}`)
  }
  if (!['missing', 'all', 'scrub'].includes(options.mode)) {
    throw new Error('--mode must be missing, all or scrub')
  }
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > MAX_PAGE_SIZE) {
    throw new Error(`--page-size must be an integer from 1 to ${MAX_PAGE_SIZE}`)
  }
  const tables = BATCH_TABLES[options.batch]
  if (options.resume && !tables.includes(options.resume.table)) {
    throw new Error(`--resume table ${options.resume.table} is not in batch ${options.batch}`)
  }
  return { ...options, tables }
}

async function countRows(sql, table, mode) {
  if (mode === 'scrub') {
    const [nodes] = await sql`select count(*)::int as n from public.cortex_nodes where ref_table = ${table}`
    return nodes.n
  }
  const missing =
    mode === 'missing'
      ? `where not exists (select 1 from public.cortex_nodes n
           where n.tenant_id = t.tenant_id and n.ref_table = '${table}'
             and n.ref_id = t.id and n.valid_to is null)`
      : ''
  const [row] = await sql.unsafe(
    `select count(*)::int as n from public."${table}" t ${missing}`
  )
  return row.n
}

// Pages one table, tenant by tenant. `state.cursor` always holds the point a
// re-run can resume from.
async function backfillTable(sql, table, options, tenants, state) {
  const totals = { processed: 0, applied: 0, skipped: 0, failed: 0 }
  const start = options.resume?.table === table ? options.resume : null
  for (const tenant of tenants) {
    if (start && tenant < start.tenant) continue
    let after = start && tenant === start.tenant ? start.after : null
    for (;;) {
      state.cursor = { table, tenant, after }
      // One short transaction per page. The timeouts are set inside it, so they
      // hold through a transaction pooler that drops startup parameters.
      const [page] = await sql.begin(async (tx) => {
        await tx`set local lock_timeout = '5s'`
        await tx`set local statement_timeout = '60s'`
        return options.mode === 'scrub'
          ? tx`
              select processed, changed as applied, skipped, failures, last_id
                from public.cortex_scrub_nodes(${table}, ${tenant}::uuid, ${options.pageSize}, ${after}::uuid)`
          : tx`
              select processed, applied, skipped, failures, last_id
                from public.cortex_backfill(${table}, ${tenant}::uuid, ${options.mode}, ${options.pageSize}, ${after}::uuid)`
      })
      if (!page || page.processed === 0) break
      totals.processed += page.processed
      totals.applied += page.applied
      totals.skipped += page.skipped
      for (const failure of page.failures ?? []) {
        totals.failed += 1
        console.error(`FAILED-ROW ${failure.table} ${failure.id} ${failure.error}`)
      }
      after = page.last_id
      // Printed after every committed page, so a killed run can resume here.
      console.log(`RESUME ${resumeArg({ table, tenant, after })}`)
    }
  }
  return totals
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`BLOCKED ${error.message}`)
    process.exitCode = 2
    return
  }
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('BLOCKED DATABASE_URL is required')
    process.exitCode = 2
    return
  }

  const postgres = createRequire(join(repoRoot, 'packages', 'database', 'package.json'))('postgres')
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
    connection: {
      application_name: 'cortex-backfill',
      lock_timeout: '5s',
      statement_timeout: '60s',
    },
  })

  const started = Date.now()
  const state = { cursor: null }
  let grandTotal = 0
  let failedRows = 0
  try {
    const tables = options.resume
      ? options.tables.slice(options.tables.indexOf(options.resume.table))
      : options.tables
    const tenants = options.dryRun
      ? []
      : (await sql`select id from public.tenants order by id`).map((row) => row.id)
    for (const table of tables) {
      const tableStarted = Date.now()
      if (options.dryRun) {
        const count = await countRows(sql, table, options.mode)
        grandTotal += count
        console.log(`would process ${String(count).padStart(7)} ${table} (${Date.now() - tableStarted} ms)`)
        continue
      }
      const totals = await backfillTable(sql, table, options, tenants, state)
      grandTotal += totals.processed
      failedRows += totals.failed
      console.log(
        `processed ${String(totals.processed).padStart(7)} ${table}: ${options.mode === 'scrub' ? 'changed' : 'applied'} ${totals.applied}, skipped ${totals.skipped} (held by a live writer), failed ${totals.failed} (${Date.now() - tableStarted} ms)`
      )
    }
    console.log(
      `${failedRows > 0 ? 'DONE WITH FAILURES' : 'OK'} batch ${options.batch} mode ${options.mode}${options.dryRun ? ' dry-run' : ''}: ${grandTotal} rows, ${failedRows} failed, in ${Date.now() - started} ms`
    )
    if (failedRows > 0) process.exitCode = 1
  } catch (error) {
    console.error(`FAILED ${error.message}`)
    if (state.cursor) console.error(`RESUME ${resumeArg(state.cursor)}`)
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
