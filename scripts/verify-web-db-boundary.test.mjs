import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWebDatabaseBoundaryReport,
  WEB_API_DATABASE_ALLOWLIST,
  verifyWebDatabaseBoundary,
} from './verify-web-db-boundary.mjs'

test('current Next API boundary has no direct database write allowance', () => {
  const report = verifyWebDatabaseBoundary()
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.blockers, [])
  assert.deepEqual(WEB_API_DATABASE_ALLOWLIST, {})
  assert.deepEqual(report.directWrites, [])
  assert.deepEqual(
    report.directReads.map((entry) => entry.path),
    [
      'apps/web/src/app/api/ai/similar-items/route.ts',
      'apps/web/src/app/api/ready/route.ts',
    ]
  )
})

test('new direct write route is blocked until migration ownership is explicit', () => {
  const report = buildWebDatabaseBoundaryReport({
    files: [
      {
        path: 'apps/web/src/app/api/invoices/route.ts',
        source: 'await db.transaction(async (tx) => tx.insert(invoices).values(row))',
      },
    ],
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /invoices\/route\.ts.*not allowlisted/)
})

test('raw execute is blocked unless the route declares read-only intent', () => {
  const report = buildWebDatabaseBoundaryReport({
    files: [
      {
        path: 'apps/web/src/app/api/unsafe/route.ts',
        source: 'await db.execute(sql`DELETE FROM invoices`)',
      },
    ],
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /must be explicitly classified read-only/)
})

test('read-only execute can be classified without allowing writes', () => {
  const report = buildWebDatabaseBoundaryReport({
    files: [
      {
        path: 'apps/web/src/app/api/read/route.ts',
        source: 'await db.execute(sql`SELECT 1`)',
      },
    ],
    readOnlyAllowlist: {
      'apps/web/src/app/api/read/route.ts': { operations: ['execute'] },
    },
  })
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.directWrites, [])
  assert.deepEqual(report.directReads[0]?.operations, ['execute'])
})

test('an allowlisted execute is blocked when its literal SQL is not SELECT-only', () => {
  const report = buildWebDatabaseBoundaryReport({
    files: [
      {
        path: 'apps/web/src/app/api/read/route.ts',
        source: 'await db.execute(sql`DELETE FROM invoices`)',
      },
    ],
    readOnlyAllowlist: {
      'apps/web/src/app/api/read/route.ts': { operations: ['execute'] },
    },
  })
  assert.equal(report.status, 'review_required')
  assert.match(
    report.blockers.join('\n'),
    /db\.execute must use a literal SELECT statement/
  )
})

test('an allowlisted multi-statement execute is blocked even when it begins with SELECT', () => {
  const report = buildWebDatabaseBoundaryReport({
    files: [
      {
        path: 'apps/web/src/app/api/read/route.ts',
        source: 'await db.execute(sql`SELECT 1; DELETE FROM invoices`)',
      },
    ],
    readOnlyAllowlist: {
      'apps/web/src/app/api/read/route.ts': { operations: ['execute'] },
    },
  })
  assert.equal(report.status, 'review_required')
  assert.match(
    report.blockers.join('\n'),
    /db\.execute must use a literal SELECT statement/
  )
})
