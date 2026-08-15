import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('WO-12 mobile inspection and offline retry contract passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-wo-12-contract.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.match(
    output,
    /WO-12 mobile inspection, photo, RFI, offline draft, and retry invariants passed/,
  )
})
