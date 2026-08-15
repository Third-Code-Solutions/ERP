import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-14 budget lock contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-14-budget-lock.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(output, /WO-14 budget approval, margin snapshot, baseline lock, revision, and exact-money invariants passed/)
})
