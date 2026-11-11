#!/usr/bin/env node

/**
 * Cortex coverage backfill (docs/erp/specs/cortex-coverage.md §7).
 *
 *   DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1 [--mode missing|all] [--dry-run]
 *
 * --mode missing (default) mirrors rows that have no current node.
 * --mode all re-applies every row, so existing nodes get the new allowlisted
 *   attributes; unchanged nodes write no provenance (cortex_upsert_node).
 * --dry-run only counts the rows each table would process. It is read-only and
 *   takes no provenance lock.
 *
 * Each page of 2000 rows commits on its own, so the per-tenant provenance lock
 * is held for one page at a time. Re-running is safe. DATABASE_URL comes from
 * the environment only.
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

export const PAGE_SIZE = 2000

export function parseArgs(argv) {
  const options = { batch: null, mode: 'missing', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--batch') options.batch = argv[++index]
    else if (arg === '--mode') options.mode = argv[++index]
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Object.hasOwn(BATCH_TABLES, options.batch ?? '')) {
    throw new Error(`--batch must be one of: ${Object.keys(BATCH_TABLES).join(', ')}`)
  }
  if (options.mode !== 'missing' && options.mode !== 'all') {
    throw new Error('--mode must be missing or all')
  }
  return { ...options, tables: BATCH_TABLES[options.batch] }
}

async function countRows(sql, table, mode) {
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

async function backfillTable(sql, table, mode) {
  let after = null
  let total = 0
  for (;;) {
    const [page] = await sql`
      select processed, last_id
        from public.cortex_backfill(${table}, ${mode}, ${PAGE_SIZE}, ${after}::uuid)`
    if (!page || page.processed === 0) return total
    total += page.processed
    after = page.last_id
  }
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
  let grandTotal = 0
  try {
    for (const table of options.tables) {
      const tableStarted = Date.now()
      const count = options.dryRun
        ? await countRows(sql, table, options.mode)
        : await backfillTable(sql, table, options.mode)
      grandTotal += count
      console.log(
        `${options.dryRun ? 'would process' : 'processed'} ${String(count).padStart(7)} ${table} (${Date.now() - tableStarted} ms)`
      )
    }
    console.log(
      `OK batch ${options.batch} mode ${options.mode}${options.dryRun ? ' dry-run' : ''}: ${grandTotal} rows in ${Date.now() - started} ms`
    )
  } catch (error) {
    console.error(`FAILED ${error.message}`)
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
