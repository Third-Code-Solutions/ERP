import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import {
  documents,
  documentUploadReservations,
} from '@third-code-erp/database'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import type { Environment } from '../config/environment'
import type { DatabaseService } from '../database/database.service'
import {
  decodeDocumentUploadReservationReconciliationCursor,
  documentUploadReservationReconciliationJobSchema,
  encodeDocumentUploadReservationReconciliationCursor,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationService } from './document-upload-reservation-reconciliation.service'
import type { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

const TENANT_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
const SECOND_TENANT_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RESERVATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
const RESERVATION_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'
const RESERVATION_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003'
const DOCUMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'

type SelectPlan = Readonly<{ rows: readonly Record<string, unknown>[] }>

function renderPredicate(predicate: SQL): {
  sql: string
  params: unknown[]
} {
  return new PgDialect().sqlToQuery(predicate)
}

function harness(options: {
  enabled?: boolean
  tenantIds?: readonly string[]
  selectPlans?: readonly SelectPlan[]
  objectPage?: {
    objects: readonly Readonly<{ storagePath: string; createdAt: Date }>[]
    hasNext: boolean
    nextCursor?: string
  }
} = {}) {
  const plans = [...(options.selectPlans ?? [])]
  const wherePredicates: SQL[] = []
  const fromTables: unknown[] = []
  const joins: Array<{ table: unknown; predicate: SQL }> = []
  const limits: number[] = []
  const select = vi.fn().mockImplementation(() => {
    const plan = plans.shift()
    if (!plan) throw new Error('unexpected_select')
    const result = Promise.resolve(plan.rows)
    const chain: Record<string, unknown> & PromiseLike<readonly Record<string, unknown>[]> = {
      from: vi.fn((table: unknown) => {
        fromTables.push(table)
        return chain
      }),
      leftJoin: vi.fn((table: unknown, predicate: SQL) => {
        joins.push({ table, predicate })
        return chain
      }),
      where: vi.fn((predicate: SQL) => {
        wherePredicates.push(predicate)
        return chain
      }),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((limit: number) => {
        limits.push(limit)
        return result
      }),
      then: result.then.bind(result),
    }
    return chain
  })
  const database = { client: { select } } as unknown as DatabaseService
  const storageProbe = {
    listReservationObjects: vi.fn().mockResolvedValue(
      options.objectPage ?? { objects: [], hasNext: false }
    ),
    createSignedUpload: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
  }
  const storage = storageProbe as unknown as DocumentUploadReservationStorage
  const values: Partial<Environment> = {
    ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ENABLED:
      options.enabled ?? true,
    ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_TENANT_IDS:
      [...(options.tenantIds ?? [TENANT_ID])],
  }
  const config = {
    get: vi.fn((key: keyof Environment) => values[key]),
  } as unknown as ConfigService<Environment, true>

  return {
    service: new DocumentUploadReservationReconciliationService(
      config,
      database,
      storage
    ),
    select,
    storage: storageProbe,
    wherePredicates,
    fromTables,
    joins,
    limits,
    remainingPlans: plans,
  }
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    tenantId: TENANT_ID,
    pageSize: 2,
    ...overrides,
  }
}

describe('DocumentUploadReservationReconciliationService', () => {
  it('fails closed for an unselected tenant without touching DB or Storage', async () => {
    const probe = harness({ enabled: false })

    await expect(probe.service.runPage(command())).resolves.toEqual({
      status: 'ignored',
      tenantId: TENANT_ID,
      phase: 'terminal',
      scanned: 0,
      findings: [],
    })
    expect(probe.select).not.toHaveBeenCalled()
    expect(probe.storage.listReservationObjects).not.toHaveBeenCalled()
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('canonicalizes case-variant tenant scope and command identities once', async () => {
    const probe = harness({
      tenantIds: [TENANT_ID.toUpperCase(), TENANT_ID],
      selectPlans: [{ rows: [] }],
    })

    expect(probe.service.scopedTenantIds()).toEqual([TENANT_ID])
    await expect(
      probe.service.runPage(
        command({ tenantId: TENANT_ID.toUpperCase() })
      )
    ).resolves.toMatchObject({
      tenantId: TENANT_ID,
      phase: 'terminal',
    })
    expect(renderPredicate(probe.wherePredicates[0]!).params).toContain(
      TENANT_ID
    )
  })

  it('rejects malformed versions, bounds, over-posting, and tenant-mismatched opaque cursors', async () => {
    const probe = harness()
    const otherTenantCursor =
      encodeDocumentUploadReservationReconciliationCursor({
        schemaVersion: 1,
        tenantId: SECOND_TENANT_ID,
        phase: 'completed',
        page: 1,
      })

    for (const invalid of [
      { ...command(), schemaVersion: 2 },
      { ...command(), pageSize: 0 },
      {
        ...command(),
        pageSize:
          DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE + 1,
      },
      { ...command(), extra: 'not-allowed' },
      { ...command(), cursor: 'not-json' },
      { ...command(), cursor: otherTenantCursor },
    ]) {
      await expect(
        probe.service.runPage(invalid as never)
      ).rejects.toThrow()
    }
    expect(probe.select).not.toHaveBeenCalled()
    expect(probe.storage.listReservationObjects).not.toHaveBeenCalled()
  })

  it('reports terminal cleanup gaps in deterministic bounded pages with exact tenant predicates', async () => {
    const firstRows = [
      {
        id: RESERVATION_1,
        projectId: PROJECT_ID,
        state: 'released',
        cleanupAttemptCount: 1,
        cleanupCompletedAt: null,
      },
      {
        id: RESERVATION_2,
        projectId: PROJECT_ID,
        state: 'expired',
        cleanupAttemptCount: 6,
        cleanupCompletedAt: null,
      },
      {
        id: RESERVATION_3,
        projectId: PROJECT_ID,
        state: 'expired',
        cleanupAttemptCount: 0,
        cleanupCompletedAt: null,
      },
    ]
    const probe = harness({ selectPlans: [{ rows: firstRows }] })

    const result = await probe.service.runPage(command())

    expect(result).toMatchObject({
      status: 'succeeded',
      tenantId: TENANT_ID,
      phase: 'terminal',
      scanned: 2,
      findings: [
        {
          category: 'terminal_cleanup_incomplete',
          reservationId: RESERVATION_1,
          state: 'released',
        },
        {
          category: 'terminal_cleanup_incomplete',
          reservationId: RESERVATION_2,
          state: 'expired',
        },
      ],
    })
    expect(result.nextCursor).toBeDefined()
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        result.nextCursor ?? '',
        TENANT_ID
      )
    ).toEqual({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'terminal',
      page: 2,
      afterId: RESERVATION_2,
    })
    expect(probe.fromTables).toEqual([documentUploadReservations])
    expect(probe.limits).toEqual([3])
    const predicate = renderPredicate(probe.wherePredicates[0]!)
    expect(predicate.params).toContain(TENANT_ID)
    expect(predicate.params).not.toContain(SECOND_TENANT_ID)
    expect(predicate.sql).toContain('cleanup_completed_at')
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('does not report terminal reservations with completed cleanup evidence', async () => {
    const probe = harness({
      selectPlans: [
        {
          rows: [
            {
              id: RESERVATION_1,
              projectId: PROJECT_ID,
              state: 'released',
              cleanupAttemptCount: 1,
              cleanupCompletedAt: new Date('2026-08-24T00:00:00Z'),
            },
          ],
        },
      ],
    })

    await expect(probe.service.runPage(command())).resolves.toMatchObject({
      scanned: 1,
      findings: [],
    })
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('filters valid completed links and reports only missing or path-inconsistent documents', async () => {
    const storagePath = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_1}-plan.pdf`
    const completedCursor =
      encodeDocumentUploadReservationReconciliationCursor({
        schemaVersion: 1,
        tenantId: TENANT_ID,
        phase: 'completed',
        page: 1,
      })
    const probe = harness({
      selectPlans: [
        {
          rows: [
            {
              id: RESERVATION_1,
              projectId: PROJECT_ID,
              storagePath,
              documentId: DOCUMENT_ID,
              linkedDocumentId: DOCUMENT_ID,
              linkedStoragePath: storagePath,
            },
            {
              id: RESERVATION_2,
              projectId: PROJECT_ID,
              storagePath,
              documentId: null,
              linkedDocumentId: null,
              linkedStoragePath: null,
            },
            {
              id: RESERVATION_3,
              projectId: PROJECT_ID,
              storagePath,
              documentId: DOCUMENT_ID,
              linkedDocumentId: DOCUMENT_ID,
              linkedStoragePath: `${storagePath}-different`,
            },
          ],
        },
      ],
    })

    const result = await probe.service.runPage(
      command({ cursor: completedCursor, pageSize: 3 })
    )

    expect(result.findings).toEqual([
      {
        category: 'completed_document_inconsistent',
        reservationId: RESERVATION_2,
        projectId: PROJECT_ID,
        documentId: null,
        inconsistency: 'document_missing',
      },
      {
        category: 'completed_document_inconsistent',
        reservationId: RESERVATION_3,
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        inconsistency: 'storage_path_mismatch',
      },
    ])
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        result.nextCursor ?? '',
        TENANT_ID
      )
    ).toEqual({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 2,
    })
    expect(probe.joins[0]?.table).toBe(documents)
    const join = renderPredicate(probe.joins[0]!.predicate)
    expect(join.sql).toContain('tenant_id')
    expect(join.sql).toContain('project_id')
    const predicate = renderPredicate(probe.wherePredicates[0]!)
    expect(predicate.params).toContain(TENANT_ID)
    expect(predicate.params).toContain('completed')
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('uses the strict 24-hour boundary, ignores legacy/unmapped paths, and suppresses any object with a tenant ledger row', async () => {
    const now = new Date('2026-08-24T12:00:00.000Z')
    const old = new Date(
      now.getTime() -
        DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS -
        1
    )
    const boundary = new Date(
      now.getTime() -
        DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS
    )
    const orphanPath = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_1}-orphan.pdf`
    const ledgerPath = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_2}-owned.pdf`
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 1,
    })
    const probe = harness({
      objectPage: {
        hasNext: false,
        objects: [
          { storagePath: orphanPath, createdAt: old },
          { storagePath: ledgerPath, createdAt: old },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-boundary.pdf`,
            createdAt: boundary,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/legacy-report.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/nested/${RESERVATION_3}-old.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-bad#name.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-bad name.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-bad\\name.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-bad..name.pdf`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-${'a'.repeat(201)}`,
            createdAt: old,
          },
          {
            storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-`,
            createdAt: old,
          },
        ],
      },
      selectPlans: [{ rows: [{ id: RESERVATION_2 }] }],
    })

    const result = await probe.service.runPage(
      command({ cursor, pageSize: 20 }),
      'trace-id',
      now
    )

    expect(result).toMatchObject({
      status: 'succeeded',
      phase: 'objects',
      scanned: 11,
      findings: [
        {
          category: 'orphan_reservation_object',
          reservationId: RESERVATION_1,
          projectId: PROJECT_ID,
          createdAt: old.toISOString(),
          objectKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain(orphanPath)
    expect(probe.storage.listReservationObjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      cursor: undefined,
      limit: 20,
    })
    const ledgerPredicate = renderPredicate(probe.wherePredicates[0]!)
    expect(ledgerPredicate.params).toContain(TENANT_ID)
    expect(ledgerPredicate.params).toContain(RESERVATION_1)
    expect(ledgerPredicate.params).toContain(RESERVATION_2)
    expect(probe.storage.remove).not.toHaveBeenCalled()
    expect(probe.storage.createSignedUpload).not.toHaveBeenCalled()
  })

  it('produces deterministic object pagination cursors and rejects a non-advancing provider cursor', async () => {
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 1,
      storageCursor: 'page-one',
    })
    const first = harness({
      objectPage: { objects: [], hasNext: true, nextCursor: 'page-two' },
    })
    const second = harness({
      objectPage: { objects: [], hasNext: true, nextCursor: 'page-two' },
    })

    const firstResult = await first.service.runPage(command({ cursor }))
    const replayResult = await second.service.runPage(command({ cursor }))
    expect(firstResult).toEqual(replayResult)
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        firstResult.nextCursor ?? '',
        TENANT_ID
      )
    ).toEqual({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 2,
      storageCursor: 'page-two',
    })

    const stalled = harness({
      objectPage: { objects: [], hasNext: true, nextCursor: 'page-one' },
    })
    await expect(stalled.service.runPage(command({ cursor }))).rejects.toThrow(
      'did not advance'
    )
    expect(stalled.storage.remove).not.toHaveBeenCalled()
  })

  it('rolls over the shared traversal cap and lets a later scheduled run reach the tail category', async () => {
    const nearLimitCursor =
      encodeDocumentUploadReservationReconciliationCursor({
        schemaVersion: 1,
        tenantId: TENANT_ID,
        phase: 'objects',
        page: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES - 1,
        storageCursor: 'page-a',
      })
    const pageB = harness({
      objectPage: { objects: [], hasNext: true, nextCursor: 'page-b' },
    })
    const pageBResult = await pageB.service.runPage(
      command({ cursor: nearLimitCursor })
    )
    const atLimitCursor = pageBResult.nextCursor ?? ''
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        atLimitCursor,
        TENANT_ID
      )
    ).toMatchObject({
      phase: 'objects',
      page: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES,
      storageCursor: 'page-b',
    })

    const cycleToA = harness({
      objectPage: { objects: [], hasNext: true, nextCursor: 'page-a' },
    })
    const rolloverResult = await cycleToA.service.runPage(
      command({ cursor: atLimitCursor })
    )
    expect(rolloverResult.nextCursor).toBeUndefined()
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        rolloverResult.rolloverCursor ?? '',
        TENANT_ID
      )
    ).toMatchObject({
      phase: 'objects',
      page: 1,
      storageCursor: 'page-a',
    })
    expect(cycleToA.storage.remove).not.toHaveBeenCalled()

    const now = new Date('2026-08-24T12:00:00.000Z')
    const tailPath = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_3}-tail.pdf`
    const laterScheduledRun = harness({
      objectPage: {
        objects: [
          {
            storagePath: tailPath,
            createdAt: new Date(
              now.getTime() -
                DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS -
                1
            ),
          },
        ],
        hasNext: false,
      },
      selectPlans: [{ rows: [] }],
    })
    await expect(
      laterScheduledRun.service.runPage(
        command({ cursor: rolloverResult.rolloverCursor }),
        'later-trace',
        now
      )
    ).resolves.toMatchObject({
      phase: 'objects',
      findings: [
        {
          category: 'orphan_reservation_object',
          reservationId: RESERVATION_3,
          projectId: PROJECT_ID,
        },
      ],
    })

    const terminalAtLimit =
      encodeDocumentUploadReservationReconciliationCursor({
        schemaVersion: 1,
        tenantId: TENANT_ID,
        phase: 'terminal',
        page: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES,
        afterId: RESERVATION_1,
      })
    const dbPhase = harness({ selectPlans: [{ rows: [] }] })
    const dbRollover = await dbPhase.service.runPage(
      command({ cursor: terminalAtLimit })
    )
    expect(
      decodeDocumentUploadReservationReconciliationCursor(
        dbRollover.rolloverCursor ?? '',
        TENANT_ID
      )
    ).toMatchObject({ phase: 'completed', page: 1 })
  })

  it('keeps command parsing strictly versioned and opaque cursor encoding stable', () => {
    expect(documentUploadReservationReconciliationJobSchema.parse(command())).toEqual(
      command()
    )
    const cursor = {
      schemaVersion: 1 as const,
      tenantId: TENANT_ID,
      phase: 'completed' as const,
      page: 1,
      afterId: RESERVATION_1,
    }
    expect(
      encodeDocumentUploadReservationReconciliationCursor(cursor)
    ).toBe(encodeDocumentUploadReservationReconciliationCursor(cursor))
    expect(
      documentUploadReservationReconciliationJobSchema.parse(
        command({ tenantId: TENANT_ID.toUpperCase() })
      ).tenantId
    ).toBe(TENANT_ID)
    expect(() =>
      encodeDocumentUploadReservationReconciliationCursor({
        ...cursor,
        tenantId: TENANT_ID.toUpperCase(),
      })
    ).toThrow()
  })
})
