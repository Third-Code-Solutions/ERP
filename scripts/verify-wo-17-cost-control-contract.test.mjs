import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-17 cost-control contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-17-cost-control-contract.mjs'],
    { cwd: process.cwd(), encoding: 'utf8' }
  )
  assert.match(
    output,
    /WO-17 BOM-line cost control, posted actual lineage, primary-page wiring, and variance invariants passed/
  )
})
