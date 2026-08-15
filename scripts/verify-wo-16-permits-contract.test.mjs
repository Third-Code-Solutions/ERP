import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-16 permits and mobilization contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-16-permits-contract.mjs'],
    { cwd: process.cwd(), encoding: 'utf8' }
  )
  assert.match(
    output,
    /WO-16 permits, LGU duration learning, four-return mobilization gate, tenant joins, and audit invariants passed/
  )
})
