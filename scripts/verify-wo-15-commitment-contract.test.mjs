import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-15 commitment contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-15-commitment-contract.mjs'],
    { cwd: process.cwd(), encoding: 'utf8' }
  )
  assert.match(
    output,
    /WO-15 budget-line commitment and preserved PO workflow invariants passed/
  )
})
