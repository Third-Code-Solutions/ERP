import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-13 award automation contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-13-award-contract.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(output, /WO-13 signed BOM award, budget, task, invoice, reversal, and exact-money invariants passed/)
})
