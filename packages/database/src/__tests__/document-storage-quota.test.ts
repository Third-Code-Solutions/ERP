import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Database } from '../client'
import {
  checkedDocumentStorageByteTotal,
  lockProjectDocumentStorageUsage,
  type DocumentStorageQuotaTransaction,
} from '../document-storage-quota'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'

type ExistingDatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

function transactionProbe(responses: readonly (readonly unknown[])[]) {
  const pendingResponses = [...responses]
  const queries: SQL[] = []
  const transaction: DocumentStorageQuotaTransaction = {
    execute(query) {
      queries.push(query)
      return Promise.resolve(pendingResponses.shift() ?? [])
    },
    rollback() {
      throw new Error('Transaction probe rollback is not expected')
    },
  }
  return { queries, transaction }
}

function queryAt(queries: readonly SQL[], index: number): SQL {
  const query = queries[index]
  if (!query) throw new Error(`Expected SQL query at index ${index}`)
  return query
}

describe('document storage quota transaction primitive', () => {
  it('accepts the existing database transaction executor', () => {
    expectTypeOf<ExistingDatabaseTransaction>().toMatchTypeOf<DocumentStorageQuotaTransaction>()
    expectTypeOf<Database>().not.toMatchTypeOf<DocumentStorageQuotaTransaction>()
  })

  it('locks only the matching non-retired project before reading usage', async () => {
    const probe = transactionProbe([
      [{ project_id: PROJECT_ID }],
      [{ committed_bytes: '25', active_reservation_bytes: '17' }],
    ])

    await expect(
      lockProjectDocumentStorageUsage(probe.transaction, {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
      }),
    ).resolves.toEqual({
      committedBytes: 25n,
      activeReservationBytes: 17n,
      totalBytes: 42n,
    })

    expect(probe.queries).toHaveLength(2)
    const dialect = new PgDialect()
    const lock = dialect.sqlToQuery(queryAt(probe.queries, 0))
    expect(lock.sql).toMatch(
      /from "projects" as project[\s\S]*?project\.tenant_id = \$1[\s\S]*?project\.id = \$2[\s\S]*?project\.deleted_at is null[\s\S]*?for update/,
    )
    expect(lock.params).toEqual([TENANT_ID, PROJECT_ID])
  })

  it('returns null without aggregating when the active project is absent', async () => {
    const probe = transactionProbe([[]])

    await expect(
      lockProjectDocumentStorageUsage(probe.transaction, {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
      }),
    ).resolves.toBeNull()
    expect(probe.queries).toHaveLength(1)
  })

  it.each([
    [
      'multiple rows',
      [{ project_id: PROJECT_ID }, { project_id: PROJECT_ID }],
    ],
    ['a malformed row', [{ project_id: 42 }]],
    ['a different project id', [{ project_id: OTHER_PROJECT_ID }]],
  ] as const)('fails closed when the project lock returns %s', async (_case, rows) => {
    const probe = transactionProbe([rows])

    await expect(
      lockProjectDocumentStorageUsage(probe.transaction, {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow(TypeError)
    expect(probe.queries).toHaveLength(1)
  })

  it('snapshots the scope before awaiting the project lock', async () => {
    const queries: SQL[] = []
    let resolveLock!: (rows: readonly unknown[]) => void
    const lockResult = new Promise<readonly unknown[]>((resolve) => {
      resolveLock = resolve
    })
    let executeCount = 0
    const transaction: DocumentStorageQuotaTransaction = {
      execute(query) {
        queries.push(query)
        executeCount += 1
        if (executeCount === 1) return lockResult
        return Promise.resolve([
          { committed_bytes: '5', active_reservation_bytes: '8' },
        ])
      },
      rollback() {
        throw new Error('Transaction probe rollback is not expected')
      },
    }
    const mutableScope = {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    }

    const usage = lockProjectDocumentStorageUsage(transaction, mutableScope)
    mutableScope.tenantId = OTHER_TENANT_ID
    mutableScope.projectId = OTHER_PROJECT_ID
    resolveLock([{ project_id: PROJECT_ID }])

    await expect(usage).resolves.toEqual({
      committedBytes: 5n,
      activeReservationBytes: 8n,
      totalBytes: 13n,
    })
    const dialect = new PgDialect()
    expect(dialect.sqlToQuery(queryAt(queries, 0)).params).toEqual([
      TENANT_ID,
      PROJECT_ID,
    ])
    expect(dialect.sqlToQuery(queryAt(queries, 1)).params).toEqual([
      TENANT_ID,
      PROJECT_ID,
      TENANT_ID,
      PROJECT_ID,
    ])
  })

  it('uses database now and text aggregates for only active unexpired reservations', async () => {
    const probe = transactionProbe([
      [{ project_id: PROJECT_ID }],
      [{ committed_bytes: '0', active_reservation_bytes: '0' }],
    ])

    await lockProjectDocumentStorageUsage(probe.transaction, {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    })

    const aggregate = new PgDialect().sqlToQuery(queryAt(probe.queries, 1))
    expect(aggregate.sql).toMatch(
      /sum\(document\.size_bytes::numeric\), 0\)::text/,
    )
    expect(aggregate.sql).toMatch(
      /sum\(reservation\.declared_size_bytes::numeric\), 0\)::text/,
    )
    expect(aggregate.sql).toMatch(/reservation\.state = 'active'/)
    expect(aggregate.sql).toMatch(/reservation\.expires_at > now\(\)/)
    expect(aggregate.params).toEqual([
      TENANT_ID,
      PROJECT_ID,
      TENANT_ID,
      PROJECT_ID,
    ])
  })

  it.each([
    ['zero rows', [], TypeError],
    [
      'multiple rows',
      [
        { committed_bytes: '1', active_reservation_bytes: '2' },
        { committed_bytes: '3', active_reservation_bytes: '4' },
      ],
      TypeError,
    ],
    [
      'non-string fields',
      [{ committed_bytes: 1, active_reservation_bytes: '2' }],
      TypeError,
    ],
    [
      'noncanonical fields',
      [{ committed_bytes: '01', active_reservation_bytes: '2' }],
      RangeError,
    ],
  ] as const)(
    'fails closed for %s from the aggregate executor',
    async (_case, aggregateRows, expectedError) => {
      const probe = transactionProbe([
        [{ project_id: PROJECT_ID }],
        aggregateRows,
      ])

      await expect(
        lockProjectDocumentStorageUsage(probe.transaction, {
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
        }),
      ).rejects.toThrow(expectedError)
    },
  )

  it('adds values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    expect(
      checkedDocumentStorageByteTotal(
        '9007199254740993',
        '9007199254740995',
      ),
    ).toEqual({
      committedBytes: 9007199254740993n,
      activeReservationBytes: 9007199254740995n,
      totalBytes: 18014398509481988n,
    })
  })

  it.each(['-1', '1.5', '1e3', '01', '', ' 1'])(
    'rejects a non-canonical database byte count: %j',
    (value) => {
      expect(() => checkedDocumentStorageByteTotal(value, '0')).toThrow(
        RangeError,
      )
      expect(() => checkedDocumentStorageByteTotal('0', value)).toThrow(
        RangeError,
      )
    },
  )
})
