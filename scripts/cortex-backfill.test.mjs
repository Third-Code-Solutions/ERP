import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BATCH_TABLES, parseArgs } from './cortex-backfill.mjs'

test('requires a known batch', () => {
  assert.throws(() => parseArgs([]), /--batch must be one of/)
  assert.throws(() => parseArgs(['--batch', '7']), /--batch must be one of/)
})

test('defaults to missing mode and accepts all and dry-run', () => {
  assert.deepEqual(parseArgs(['--batch', '1']), {
    batch: '1',
    mode: 'missing',
    dryRun: false,
    tables: BATCH_TABLES[1],
  })
  const options = parseArgs(['--batch', '1', '--mode', 'all', '--dry-run'])
  assert.equal(options.mode, 'all')
  assert.equal(options.dryRun, true)
})

test('rejects unknown modes and arguments', () => {
  assert.throws(() => parseArgs(['--batch', '1', '--mode', 'everything']), /--mode/)
  assert.throws(() => parseArgs(['--batch', '1', '--url', 'x']), /unknown argument/)
})

test('batch 1 mirrors endpoints before the rows that point at them', () => {
  const tables = BATCH_TABLES[1]
  assert.equal(tables.length, 27)
  assert.equal(new Set(tables).size, tables.length)
  assert.ok(tables.indexOf('users') < tables.indexOf('opportunities'))
  assert.ok(tables.indexOf('accounts') < tables.indexOf('opportunities'))
  assert.ok(tables.indexOf('vendors') < tables.indexOf('rfqs'))
})
