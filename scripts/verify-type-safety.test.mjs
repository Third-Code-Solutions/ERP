import assert from 'node:assert/strict'
import test from 'node:test'
import { findTypeSafetyViolations, scanTypeSafety } from './verify-type-safety.mjs'

test('rejects explicit type escapes', () => {
  const violations = findTypeSafetyViolations(
    'fixture.ts',
    'const value = input as any\n// @ts-ignore\ntype Unsafe = any'
  )
  assert.equal(violations.length, 3)
})

test('active production source has no explicit type escapes', () => {
  const report = scanTypeSafety(process.cwd())
  assert.deepEqual(report.violations, [])
  assert.ok(report.filesScanned > 0)
})
