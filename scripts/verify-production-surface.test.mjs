import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { evaluateProductionSurface } from './verify-production-surface.mjs'

test('root package exposes the documented production-surface command', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  )

  assert.equal(
    packageJson.scripts['verify:production-surface'],
    'node scripts/verify-production-surface.mjs'
  )
  assert.equal(
    packageJson.scripts['test:production-surface'],
    'node --test scripts/verify-production-surface.test.mjs'
  )
})

function response(status, json, text = '') {
  return { status, json, text }
}

test('accepts a coherent ABI OPS production surface', () => {
  const report = evaluateProductionSurface({
    health: response(200, { ok: true, service: 'abi-ops-web', revision: 'dpl_test' }),
    ready: response(200, { ok: true, database: 'up' }),
    manifest: response(200, { name: 'ABI OPS', short_name: 'ABI OPS' }),
    root: response(200, null, '<title>ABI OPS</title>'),
  })

  assert.deepEqual(report, {
    passed: true,
    failures: [],
    revision: 'dpl_test',
  })
})

test('blocks stale identity and branding drift', () => {
  const report = evaluateProductionSurface({
    health: response(200, { ok: true, service: 'third-code-erp-web', revision: 'dpl_old' }),
    ready: response(200, { ok: true, database: 'up' }),
    manifest: response(200, { name: 'ABI OS', short_name: 'ABI OS' }),
    root: response(200, null, 'Third Code Solutions Inc. ABI OS'),
  })

  assert.equal(report.passed, false)
  assert.deepEqual(report.failures, [
    'health identity is not abi-ops-web with ok=true',
    'manifest name and short_name must both be ABI OPS',
    'landing output does not contain ABI OPS',
    'landing output contains legacy product or legal branding',
  ])
})

test('blocks legacy product branding even when the legal name is absent', () => {
  const report = evaluateProductionSurface({
    health: response(200, { ok: true, service: 'abi-ops-web', revision: 'dpl_old' }),
    ready: response(200, { ok: true, database: 'up' }),
    manifest: response(200, { name: 'ABI OPS', short_name: 'ABI OPS' }),
    root: response(200, null, '<title>ABI OS</title>'),
  })

  assert.equal(report.passed, false)
  assert.deepEqual(report.failures, [
    'landing output does not contain ABI OPS',
    'landing output contains legacy product or legal branding',
  ])
})
