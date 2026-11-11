import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BATCH_TABLES,
  DEFAULT_PAGE_SIZE,
  backfillTable,
  parseArgs,
  parseResume,
  resumeArg,
} from './cortex-backfill.mjs'

const TENANT = '2b2b039c-b066-412b-af4c-564f2af6097e'
const ROW = '0f8fad5b-d9cb-469f-a165-70867728950e'

test('requires a known batch', () => {
  assert.throws(() => parseArgs([]), /--batch must be one of/)
  assert.throws(() => parseArgs(['--batch', '7']), /--batch must be one of/)
})

test('defaults to missing mode and a small page, and accepts all and dry-run', () => {
  assert.deepEqual(parseArgs(['--batch', '1']), {
    batch: '1',
    mode: 'missing',
    dryRun: false,
    pageSize: DEFAULT_PAGE_SIZE,
    resume: null,
    tables: BATCH_TABLES[1],
  })
  // The runbook's off-peak page: short transactions, short tenant locks.
  assert.equal(DEFAULT_PAGE_SIZE, 50)
  const options = parseArgs(['--batch', '1', '--mode', 'all', '--dry-run'])
  assert.equal(options.mode, 'all')
  assert.equal(options.dryRun, true)
  assert.equal(parseArgs(['--batch', '1', '--mode', 'scrub']).mode, 'scrub')
})

test('rejects unknown modes and arguments', () => {
  assert.throws(() => parseArgs(['--batch', '1', '--mode', 'everything']), /--mode/)
  assert.throws(() => parseArgs(['--batch', '1', '--url', 'x']), /unknown argument/)
})

test('page size is an integer from 1 to 2000', () => {
  assert.equal(parseArgs(['--batch', '1', '--page-size', '50']).pageSize, 50)
  for (const bad of ['0', '2001', '1.5', 'x']) {
    assert.throws(() => parseArgs(['--batch', '1', '--page-size', bad]), /--page-size/)
  }
})

test('a printed resume point parses back to the same cursor', () => {
  const cursor = { table: 'vendors', tenant: TENANT, after: ROW }
  const printed = resumeArg(cursor)
  assert.equal(printed, `--resume vendors:${TENANT}:${ROW}`)
  assert.deepEqual(parseArgs(['--batch', '1', ...printed.split(' ')]).resume, cursor)
  assert.deepEqual(parseResume(`vendors:${TENANT.toUpperCase()}`), { table: 'vendors', tenant: TENANT, after: null })
})

test('rejects a malformed resume point or one outside the batch', () => {
  for (const bad of ['vendors', 'vendors:not-a-uuid', `vendors:${TENANT}:bad`, `vendors:${TENANT}:${ROW}:x`]) {
    assert.throws(() => parseResume(bad), /--resume must be/)
  }
  assert.throws(() => parseArgs(['--batch', '1', '--resume', `invoices:${TENANT}`]), /not in batch 1/)
})

test('batch 1 mirrors endpoints before the rows that point at them', () => {
  const tables = BATCH_TABLES[1]
  assert.equal(tables.length, 27)
  assert.equal(new Set(tables).size, tables.length)
  assert.ok(tables.indexOf('users') < tables.indexOf('opportunities'))
  assert.ok(tables.indexOf('accounts') < tables.indexOf('opportunities'))
  assert.ok(tables.indexOf('vendors') < tables.indexOf('rfqs'))
})

// A postgres.js-shaped fake: `begin(fn)` runs fn with a tagged-template tx.
// Each tenant holds ROWS[tenant] ids; a page returns the ids after `after`.
const T1 = '00000000-0000-4000-8000-000000000001'
const T2 = '00000000-0000-4000-8000-000000000002'
const ids = ['a', 'b', 'c', 'd', 'e'].map((c) => `0000000${c}-0000-4000-8000-000000000000`)

function fakeSql({ failOnCall = -1 } = {}) {
  const calls = []
  const statements = []
  const tx = (strings, ...values) => {
    const text = strings.join('?')
    statements.push(text.trim().split(/\s+/).slice(0, 4).join(' '))
    if (text.includes('set local')) return Promise.resolve([])
    const scrub = text.includes('cortex_scrub_nodes')
    const [table, tenant, , pageSize, after] = scrub ? [values[0], values[1], null, values[2], values[3]] : values
    calls.push({ table, tenant, pageSize, after })
    if (calls.length - 1 === failOnCall) return Promise.reject(new Error('canceling statement due to lock timeout'))
    const page = ids.filter((id) => !after || id > after).slice(0, pageSize)
    const failures = page.includes(ids[3]) ? [{ table, id: ids[3], error: 'boom' }] : []
    const done = page.length - failures.length
    // Columns as Postgres names them: the scrub's `changed` reaches the script
    // as `applied` only through the alias.
    const counts = scrub
      ? (text.includes('changed as applied') ? { applied: done } : { changed: done })
      : { applied: done }
    return Promise.resolve([{ processed: page.length, ...counts, skipped: 0, failures, last_id: page.at(-1) ?? after }])
  }
  return { calls, statements, begin: async (fn) => fn(tx) }
}

function captureConsole(t) {
  const lines = []
  t.mock.method(console, 'log', (line) => lines.push(`LOG ${line}`))
  t.mock.method(console, 'error', (line) => lines.push(`ERR ${line}`))
  return lines
}

test('backfillTable resumes at the printed point and prints RESUME after every page', async (t) => {
  const lines = captureConsole(t)
  const sql = fakeSql()
  const state = { cursor: null }
  const totals = await backfillTable(
    sql, 'vendors', { mode: 'all', pageSize: 2, resume: { table: 'vendors', tenant: T2, after: ids[1] } }, [T1, T2], state
  )
  // T1 sorts before the resume tenant and is skipped; T2 starts after ids[1].
  assert.deepEqual(sql.calls.map(({ tenant, after }) => [tenant, after]), [[T2, ids[1]], [T2, ids[3]], [T2, ids[4]]])
  assert.deepEqual(sql.calls.map(({ pageSize }) => pageSize), [2, 2, 2])
  assert.deepEqual(totals, { processed: 3, applied: 2, skipped: 0, failed: 1 })
  assert.deepEqual(lines, [
    `ERR FAILED-ROW vendors ${ids[3]} boom`,
    `LOG RESUME --resume vendors:${T2}:${ids[3]}`,
    `LOG RESUME --resume vendors:${T2}:${ids[4]}`,
  ])
  // The timeouts are set inside each page's own transaction, before its call.
  assert.deepEqual(sql.statements.slice(0, 3), ['set local lock_timeout =', 'set local statement_timeout =', 'select processed, applied, skipped,'])
})

test('backfillTable starts every tenant from the top when the resume point is another table', async (t) => {
  captureConsole(t)
  const sql = fakeSql()
  await backfillTable(sql, 'vendors', { mode: 'missing', pageSize: 5, resume: { table: 'users', tenant: T2, after: ids[1] } }, [T1, T2], { cursor: null })
  assert.deepEqual(sql.calls.map(({ tenant, after }) => [tenant, after]), [[T1, null], [T1, ids[4]], [T2, null], [T2, ids[4]]])
})

test('a failed page leaves the cursor on that page, after the last committed RESUME', async (t) => {
  const lines = captureConsole(t)
  const sql = fakeSql({ failOnCall: 1 })
  const state = { cursor: null }
  await assert.rejects(
    backfillTable(sql, 'vendors', { mode: 'all', pageSize: 2, resume: null }, [T1], state),
    /lock timeout/
  )
  assert.deepEqual(state.cursor, { table: 'vendors', tenant: T1, after: ids[1] })
  assert.equal(resumeArg(state.cursor), `--resume vendors:${T1}:${ids[1]}`)
  assert.deepEqual(lines, [`LOG RESUME --resume vendors:${T1}:${ids[1]}`])
})

test('scrub mode reads cortex_scrub_nodes changed through the applied alias', async (t) => {
  captureConsole(t)
  const sql = fakeSql()
  const totals = await backfillTable(sql, 'vendors', { mode: 'scrub', pageSize: 5, resume: null }, [T1], { cursor: null })
  assert.deepEqual(totals, { processed: 5, applied: 4, skipped: 0, failed: 1 })
  assert.deepEqual(sql.calls.map(({ pageSize, after }) => [pageSize, after]), [[5, null], [5, ids[4]]])
})
