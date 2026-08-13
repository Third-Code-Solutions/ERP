import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { auditAppRouterBoundaries } from './verify-app-router-boundaries.mjs'

test('current web App Router has ancestor boundaries for every page', () => {
  const report = auditAppRouterBoundaries()
  assert.equal(report.passed, true)
  assert.equal(report.uncovered.length, 0)
  assert.ok(report.pageCount > 0)
})

test('reports missing boundary coverage in an isolated route tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'abi-ops-router-boundaries-'))
  try {
    mkdirSync(join(root, 'nested'), { recursive: true })
    writeFileSync(join(root, 'loading.tsx'), 'export default function Loading() {}')
    writeFileSync(join(root, 'nested', 'page.tsx'), 'export default function Page() {}')

    const report = auditAppRouterBoundaries(root)
    assert.equal(report.passed, false)
    assert.deepEqual(report.uncovered, [
      { page: 'nested/page.tsx', missing: ['error.tsx'] },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
