import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-10 RFQ price-history contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-10-rfq-price-history.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(output, /WO-10 RFQ, award, price-history, DUPA suggestion, and stale-rate invariants passed/)
})
