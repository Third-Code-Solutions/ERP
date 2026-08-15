import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWebDatabaseBoundaryReport,
  verifyWebDatabaseBoundary,
} from './verify-web-db-boundary.mjs'

test('current Next API direct database surface is explicitly classified', () => {
  const report = verifyWebDatabaseBoundary()
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.blockers, [])
  assert.deepEqual(
    report.directWrites.map((entry) => [entry.path, entry.operations]),
    [
      [
        'apps/web/src/app/api/bom/takeoff-import/route.ts',
        ['insert', 'transaction', 'update'],
      ],
      [
        'apps/web/src/app/api/crm/opportunities/[id]/inspection-photos/route.ts',
        ['insert', 'transaction'],
      ],
      ['apps/web/src/app/api/notifications/route.ts', ['update']],
      [
        'apps/web/src/app/api/upload/complete/route.ts',
        ['insert', 'transaction'],
      ],
      [
        'apps/web/src/app/api/webhooks/docuseal/route.ts',
        ['insert', 'update'],
      ],
    ]
  )
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
