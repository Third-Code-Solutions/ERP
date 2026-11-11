#!/usr/bin/env node

/**
 * Load the master price catalogue research files into one tenant
 * (docs/erp/specs/catalogue.md, section 4).
 *
 *   node scripts/seed-catalogue.mjs --tenant <uuid> [--dry-run] [--dir data/catalogue]
 *
 * Every row of every `NN-<trade>.csv` is validated before anything is
 * written; an invalid row stops the run with its file:line. The load is one
 * transaction and idempotent: a second run inserts no catalogue rows. An item
 * a person has edited is never overwritten. A row without a price still
 * records one observation, with null prices, that keeps its flag and note. `--dry-run` validates and prints
 * per-trade counts without opening a database connection (and needs no
 * tenant). After a real run commits, it runs ANALYZE on both catalogue tables.
 * DATABASE_URL is read from the environment only.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { ANALYZED_TABLES, analyzeCatalogue, seedCatalogue } from './lib/catalogue-seed.mjs'
import { importTypeScript } from './lib/import-typescript.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const FILE_NAME = /^\d{2}-([a-z-]+)\.csv$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The parser and its rules are the web app's own TypeScript, not a copy.
const { parseCatalogueCsv } = await importTypeScript(
  new URL('../apps/web/src/lib/catalogue/csv.ts', import.meta.url)
)

export function parseCliArguments(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      tenant: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      dir: { type: 'string', default: 'data/catalogue' },
    },
  })
  const dryRun = values['dry-run']
  if (!dryRun && !values.tenant) throw new Error('--tenant <uuid> is required')
  if (values.tenant && !UUID.test(values.tenant)) {
    throw new Error('--tenant must be a UUID')
  }
  return { tenantId: values.tenant ?? null, dryRun, directory: resolve(repoRoot, values.dir) }
}

/**
 * Validate every catalogue file in a directory. Throws an Error whose message
 * starts with `file:line:` on the first invalid row.
 */
export function loadCatalogueRows(directory, today) {
  const files = readdirSync(directory).filter((name) => FILE_NAME.test(name)).sort()
  if (files.length === 0) throw new Error(`No NN-<trade>.csv files in ${directory}`)

  const firstSeen = new Map()
  const rows = []
  for (const file of files) {
    const expectedTrade = FILE_NAME.exec(file)[1]
    let fileRows
    try {
      fileRows = parseCatalogueCsv(readFileSync(join(directory, file), 'utf8'), {
        today,
        expectedTrade,
      })
    } catch (error) {
      if (error?.name !== 'CatalogueCsvError') throw error
      throw new Error(`${file}:${error.line}: ${error.message}`, { cause: error })
    }
    for (const row of fileRows) {
      const location = `${file}:${row.line}`
      if (firstSeen.has(row.code)) {
        throw new Error(
          `${location}: code "${row.code}" already appears at ${firstSeen.get(row.code)}`
        )
      }
      firstSeen.set(row.code, location)
      rows.push(row)
    }
  }
  return rows
}

/** The value `read` returns, or null when it throws or returns nothing. */
function orNull(read) {
  try {
    return read() || null
  } catch {
    return null
  }
}

/**
 * Who ran the seed and from which files, for the run's audit entry: the OS
 * user, the data directory (relative to the repository), each CSV's SHA-256
 * and the git commit when there is one. Never the DATABASE_URL.
 */
export function describeSeedRun(directory) {
  const gitCommit = orNull(() =>
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  )
  return {
    operator: orNull(() => userInfo().username),
    dataDirectory: relative(repoRoot, directory).split(sep).join('/') || '.',
    files: readdirSync(directory)
      .filter((name) => FILE_NAME.test(name))
      .sort()
      .map((name) => ({
        name,
        sha256: createHash('sha256').update(readFileSync(join(directory, name))).digest('hex'),
      })),
    gitCommit: /^[0-9a-f]{40}$/.test(gitCommit ?? '') ? gitCommit : null,
  }
}

export function countByTrade(rows) {
  const counts = new Map()
  for (const row of rows) {
    const entry = counts.get(row.trade) ?? { trade: row.trade, items: 0, priced: 0, unpriced: 0 }
    counts.set(row.trade, {
      ...entry,
      items: entry.items + 1,
      priced: entry.priced + (row.price ? 1 : 0),
      unpriced: entry.unpriced + (row.price ? 0 : 1),
    })
  }
  return [...counts.values()]
}

function printTradeCounts(rows) {
  const counts = countByTrade(rows)
  const total = {
    trade: 'TOTAL',
    items: rows.length,
    priced: rows.filter((row) => row.price).length,
    unpriced: rows.filter((row) => !row.price).length,
  }
  for (const entry of [...counts, total]) {
    console.log(
      `${entry.trade.padEnd(24)} items ${String(entry.items).padStart(5)}  ` +
        `priced ${String(entry.priced).padStart(5)}  no price ${String(entry.unpriced).padStart(5)}`
    )
  }
}

async function main() {
  const { tenantId, dryRun, directory } = parseCliArguments(process.argv.slice(2))
  const rows = loadCatalogueRows(directory)
  printTradeCounts(rows)

  if (dryRun) {
    console.log('Dry run: every row is valid; nothing was written.')
    return
  }

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL must be set in the environment')
  const postgres = createRequire(join(repoRoot, 'packages', 'database', 'package.json'))(
    'postgres'
  )
  const sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5 })
  try {
    const source = describeSeedRun(directory)
    const counts = await sql.begin((transaction) =>
      seedCatalogue(transaction, { tenantId, rows, source })
    )
    console.log(
      `Items: ${counts.itemsInserted} inserted, ${counts.itemsUpdated} updated, ` +
        `${counts.itemsUnchanged} unchanged, ${counts.itemsKeptEdited} left alone (edited by a person).`
    )
    console.log(
      `Observations: ${counts.pricesInserted} inserted, ${counts.pricesAlreadyPresent} already present ` +
        `(${counts.unpricedRows} of the ${counts.items} rows record that no price was found).`
    )
    console.log(
      'A row whose only change is its flag, notes or price basis is not applied: an observation ' +
        'is matched on item, region, date, link and prices, and is never updated. Give such a row ' +
        'a new date_checked to record it.'
    )
    console.log(
      'One audit_log entry (catalogue_seed) records these counts, the operator, the data ' +
        'directory, the SHA-256 of each file and the git commit.'
    )
    try {
      await analyzeCatalogue(sql)
    } catch (error) {
      process.exitCode = 1
      console.error(
        `The load is committed, but ANALYZE failed (${error instanceof Error ? error.message : String(error)}). ` +
          `Run it by hand: analyze ${ANALYZED_TABLES.join('; analyze ')};`
      )
      return
    }
    console.log(`Ran ANALYZE on ${ANALYZED_TABLES.join(' and ')}.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main()
  } catch (error) {
    console.error(`Catalogue seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
