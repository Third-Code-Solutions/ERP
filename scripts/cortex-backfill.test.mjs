import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BATCH_TABLES, DEFAULT_PAGE_SIZE, parseArgs, parseResume, resumeArg } from './cortex-backfill.mjs'

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
