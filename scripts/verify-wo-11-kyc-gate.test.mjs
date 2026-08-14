import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-11 PPRF and dual-track KYC contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-11-kyc-gate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(output, /WO-11 PPRF, dual-track KYC, downstream stage lock, and visible-reason invariants passed/)
})
