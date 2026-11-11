import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { seedCatalogue } from './lib/catalogue-seed.mjs'
import { countByTrade, loadCatalogueRows, parseCliArguments } from './seed-catalogue.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataDirectory = join(repoRoot, 'data', 'catalogue')
const script = join(repoRoot, 'scripts', 'seed-catalogue.mjs')
const TENANT = '22222222-2222-4222-8222-222222222222'
const HEADER =
  'code,name,trade,specification,unit,price_low_php,price_avg_php,price_high_php,region,price_basis,source_url,date_checked,flag,notes'
const PRICED = 'CN-0001,Cement 40 kg,concrete,,bag,240,265,280,NCR,material_supply,https://example.com/a,2026-11-05,,'
const UNPRICED =
  'CN-0002,Cement 50 kg,concrete,,bag,,,,National,material_supply,https://example.com/none,2026-11-05,NO_SOURCE,No retailer lists a 50 kg bag'

function withFiles(files, run) {
  const directory = mkdtempSync(join(tmpdir(), 'catalogue-seed-'))
  try {
    for (const [name, lines] of Object.entries(files)) {
      writeFileSync(join(directory, name), [HEADER, ...lines].join('\n'))
    }
    return run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('every row of the research files is valid, and the counts come from the files', () => {
  const files = readdirSync(dataDirectory).filter((name) => /^\d{2}-[a-z-]+\.csv$/.test(name))
  // Independent count: a record starts with its code at the beginning of a line.
  const records = files.flatMap((name) =>
    readFileSync(join(dataDirectory, name), 'utf8').match(/^[A-Z]{2}-\d{4},/gm) ?? []
  )

  const rows = loadCatalogueRows(dataDirectory)
  const perTrade = countByTrade(rows)

  assert.equal(files.length, 20)
  assert.equal(rows.length, records.length)
  assert.equal(new Set(rows.map((row) => row.code)).size, rows.length)
  assert.equal(perTrade.length, 20)
  assert.equal(perTrade.reduce((sum, entry) => sum + entry.items, 0), rows.length)
  for (const entry of perTrade) assert.equal(entry.priced + entry.unpriced, entry.items)
  for (const row of rows) {
    assert.equal(row.price === null, row.flag === 'NO_SOURCE', row.code)
    if (row.price) {
      assert.ok(Number.isSafeInteger(row.price.low) && row.price.low >= 0, row.code)
      assert.ok(row.price.low <= row.price.avg && row.price.avg <= row.price.high, row.code)
    }
  }
})

test('an invalid row stops the load with its file and line', () => {
  withFiles(
    { '01-earthworks.csv': [], '02-concrete.csv': [PRICED, PRICED.replace('CN-0001', 'CN-0003').replace(',265,', ',2x5,')] },
    (directory) => {
      assert.throws(
        () => loadCatalogueRows(directory),
        /^Error: 02-concrete\.csv:3: price_avg_php "2x5" is not a valid peso amount/
      )
    }
  )
})

test('a row in the wrong trade file, a repeated code and a future date are rejected', () => {
  withFiles({ '11-paint.csv': [PRICED] }, (directory) => {
    assert.throws(() => loadCatalogueRows(directory), /11-paint\.csv:2: trade "concrete" does not belong/)
  })
  withFiles({ '02-concrete.csv': [PRICED], '03-concrete.csv': [UNPRICED, PRICED] }, (directory) => {
    assert.throws(
      () => loadCatalogueRows(directory),
      /03-concrete\.csv:3: code "CN-0001" already appears at 02-concrete\.csv:2/
    )
  })
  withFiles({ '02-concrete.csv': [PRICED] }, (directory) => {
    assert.throws(() => loadCatalogueRows(directory, '2026-11-04'), /02-concrete\.csv:2: .*after today/)
    assert.equal(loadCatalogueRows(directory, '2026-11-05').length, 1)
  })
  withFiles({ 'notes.txt': [] }, (directory) => {
    assert.throws(() => loadCatalogueRows(directory), /No NN-<trade>\.csv files/)
  })
})

test('the command line needs a tenant UUID unless it is a dry run', () => {
  assert.throws(() => parseCliArguments([]), /--tenant <uuid> is required/)
  assert.throws(() => parseCliArguments(['--tenant', 'abi-ops']), /must be a UUID/)
  assert.throws(() => parseCliArguments(['--tenant', TENANT, '--force']), /Unknown option/)
  assert.deepEqual(parseCliArguments(['--dry-run']), {
    tenantId: null,
    dryRun: true,
    directory: dataDirectory,
  })
  assert.equal(parseCliArguments(['--tenant', TENANT, '--dir', 'tmp/x']).directory, join(repoRoot, 'tmp', 'x'))
})

test('a dry run prints per-trade counts and needs no database', () => {
  const result = spawnSync(process.execPath, [script, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^earthworks\s+items\s+\d+\s+priced\s+\d+\s+no price\s+\d+$/m)
  assert.match(result.stdout, /^TOTAL\s+items\s+\d+/m)
  assert.match(result.stdout, /nothing was written/)
})

test('a real run refuses to start without DATABASE_URL in the environment', () => {
  const result = spawnSync(process.execPath, [script, '--tenant', TENANT], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /DATABASE_URL must be set in the environment/)
})

test('the seed writes items, then one observation per row, then one audit entry, and reports what it left alone', async () => {
  const rows = withFiles({ '02-concrete.csv': [PRICED, UNPRICED] }, (directory) =>
    loadCatalogueRows(directory, '2026-11-10')
  )
  const statements = []
  const replies = [
    [{ id: TENANT }], // tenant exists
    [{ count: 1 }], // one seeded code was edited by a person
    [{ inserted: true }], // upsert: one new item, the edited one untouched
    [], // both observations, the priced one and the one without a price, are already there
    [{}], // audit chain lock
    [],
  ]
  const sql = {
    unsafe: async (query, parameters) => {
      statements.push({ query, parameters })
      return replies[statements.length - 1]
    },
  }

  const counts = await seedCatalogue(sql, { tenantId: TENANT, rows })

  assert.deepEqual(counts, {
    items: 2,
    itemsInserted: 1,
    itemsUpdated: 0,
    itemsKeptEdited: 1,
    itemsUnchanged: 0,
    pricedRows: 1,
    unpricedRows: 1,
    pricesInserted: 0,
    pricesAlreadyPresent: 2,
  })
  assert.equal(statements.length, 6)
  for (const { parameters } of statements) assert.equal(parameters[0], TENANT)

  const [, , upsert, prices, lock, audit] = statements
  assert.match(upsert.query, /on conflict \(tenant_id, code\) do update/)
  assert.match(upsert.query, /where catalogue_items\.updated_by is null/)
  assert.deepEqual(JSON.parse(upsert.parameters[1]).map((item) => item.code), ['CN-0001', 'CN-0002'])
  assert.match(prices.query, /'research'/)
  assert.match(prices.query, /where not exists/)
  // Null prices must compare equal, or every run would insert the unpriced
  // observation again.
  assert.match(prices.query, /existing\.price_low_centavos is not distinct from r\.low\b/)
  assert.match(prices.query, /existing\.price_avg_centavos is not distinct from r\.avg\b/)
  assert.match(prices.query, /existing\.price_high_centavos is not distinct from r\.high\b/)
  assert.doesNotMatch(prices.query, /_centavos = r\./)
  assert.deepEqual(JSON.parse(prices.parameters[1]), [
    {
      code: 'CN-0001',
      region: 'NCR',
      low: 24000,
      avg: 26500,
      high: 28000,
      price_basis: 'material_supply',
      source_url: 'https://example.com/a',
      checked_on: '2026-11-05',
      flag: null,
      notes: null,
    },
    // The row without a price: no amounts, but its region, link, flag and note.
    {
      code: 'CN-0002',
      region: 'National',
      low: null,
      avg: null,
      high: null,
      price_basis: 'material_supply',
      source_url: 'https://example.com/none',
      checked_on: '2026-11-05',
      flag: 'NO_SOURCE',
      notes: 'No retailer lists a 50 kg bag',
    },
  ])
  assert.match(lock.query, /pg_advisory_xact_lock\(hashtextextended\('audit_log:'/)
  assert.match(audit.query, /insert into public\.audit_log/)
  assert.deepEqual(JSON.parse(audit.parameters[1]), counts)
})

test('the seed stops before writing when the tenant does not exist', async () => {
  const statements = []
  const sql = {
    unsafe: async (query) => {
      statements.push(query)
      return []
    },
  }

  await assert.rejects(seedCatalogue(sql, { tenantId: TENANT, rows: [] }), /does not exist/)
  assert.equal(statements.length, 1)
})
