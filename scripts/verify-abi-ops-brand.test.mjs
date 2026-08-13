import assert from 'node:assert/strict'
import test from 'node:test'
import { findLegacyBrandViolations, scanAbiOpsBrand } from './verify-abi-ops-brand.mjs'

test('legacy legal and product names are rejected', () => {
  const violations = findLegacyBrandViolations(
    'fixture.ts',
    'Third Code Solutions Inc. / Third Code ERP / ABI OS / abi-os / AbiOs'
  )
  assert.equal(violations.length, 5)
})

test('active repository branding contract is clean', () => {
  const report = scanAbiOpsBrand(process.cwd())
  assert.deepEqual(report.violations, [])
  assert.ok(report.filesScanned > 0)
})
