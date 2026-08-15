import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-18 management dashboard contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-18-dashboard-contract.mjs'],
    { cwd: process.cwd(), encoding: 'utf8' }
  )
  assert.match(
    output,
    /WO-18 management dashboard metrics, FYTD closed-won bound, execution-health signals, and tenant invariants passed/
  )
})
