import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import {
  documentUploadReservations,
  projects,
} from '@third-code-erp/database'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import type { AuditService } from '../audit/audit.service'
import type { Environment } from '../config/environment'
import type { DatabaseService } from '../database/database.service'
import {
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
} from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationCleanupService } from './document-upload-reservation-cleanup.service'
import type { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_TENANT_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

type Candidate = Readonly<{
  id: string
  tenantId?: string
  projectId: string
  expiresAt?: Date
}>
type Claim = Readonly<{
  id: string
  tenantId: string
  projectId: string
  storagePath: string
  attempt: number
}>
type TransactionPlan =
  | Readonly<{
      kind: 'expire'
      candidates: readonly Candidate[]
      expiredIds: readonly string[]
    }>
  | Readonly<{ kind: 'claim'; claims: readonly Claim[] }>
  | Readonly<{ kind: 'record'; updated?: boolean }>

function uuid(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`
}

function makeHarness(options: {
  enabled?: boolean
  tenantIds?: readonly string[]
  plans?: readonly TransactionPlan[]
  failedPaths?: readonly string[]
} = {}) {
  const plans = [...(options.plans ?? [])]
  const events: string[] = []
  const limits: number[] = []
  const lockArguments: Array<readonly unknown[]> = []
  const updatePayloads: Array<Record<string, unknown>> = []
  const wherePredicates: SQL[] = []

  const transaction = vi.fn().mockImplementation(
    async (callback: (client: Record<string, unknown>) => Promise<unknown>) => {
      const plan = plans.shift()
      if (!plan) throw new Error('unexpected_transaction')
      let selectCall = 0
      events.push(`transaction:begin:${plan.kind}`)

      const client = {
        select: vi.fn().mockImplementation(() => {
          selectCall += 1
          return {
            from: vi.fn().mockImplementation((table: unknown) => {
              if (plan.kind === 'expire' && selectCall === 1) {
                expect(table).toBe(documentUploadReservations)
                return {
                  where: vi.fn().mockImplementation((predicate: SQL) => {
                    wherePredicates.push(predicate)
                    return {
                      orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockImplementation((limit: number) => {
                          limits.push(limit)
                          events.push('expire:candidates')
                          return Promise.resolve(
                            plan.candidates.map((candidate) => ({
                              ...candidate,
                              tenantId: candidate.tenantId ?? TENANT_ID,
                              expiresAt:
                                candidate.expiresAt ??
                                new Date(Date.now() - 10_000),
                            }))
                          )
                        }),
                      }),
                    }
                  }),
                }
              }
              if (plan.kind === 'expire' && selectCall >= 2) {
                expect(table).toBe(projects)
                return {
                  where: vi.fn().mockImplementation((predicate: SQL) => {
                    wherePredicates.push(predicate)
                    return {
                      orderBy: vi.fn().mockReturnValue({
                        for: vi
                          .fn()
                          .mockImplementation((...args: unknown[]) => {
                            lockArguments.push(args)
                            events.push('expire:project-lock')
                            return Promise.resolve(
                              plan.candidates.map(({ projectId }) => ({
                                id: projectId,
                              }))
                            )
                          }),
                      }),
                    }
                  }),
                }
              }
              if (plan.kind === 'claim') {
                expect(table).toBe(documentUploadReservations)
                return {
                  where: vi.fn().mockImplementation((predicate: SQL) => {
                    wherePredicates.push(predicate)
                    return {
                      orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockImplementation((limit: number) => {
                          limits.push(limit)
                          return {
                            for: vi
                              .fn()
                              .mockImplementation((...args: unknown[]) => {
                                lockArguments.push(args)
                                events.push('claim:locked')
                                return Promise.resolve(
                                  plan.claims.map(({ id }) => ({ id }))
                                )
                              }),
                          }
                        }),
                      }),
                    }
                  }),
                }
              }
              throw new Error('unexpected_select')
            }),
          }
        }),
        update: vi.fn().mockImplementation((table: unknown) => {
          expect(table).toBe(documentUploadReservations)
          return {
            set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              updatePayloads.push(payload)
              return {
                where: vi.fn().mockImplementation((predicate: SQL) => {
                  wherePredicates.push(predicate)
                  return {
                    returning: vi.fn().mockImplementation(async () => {
                      if (plan.kind === 'expire') {
                        events.push('expire:update')
                        return plan.expiredIds.map((id) => ({
                          id,
                          tenantId:
                            plan.candidates.find(
                              (candidate) => candidate.id === id
                            )?.tenantId ?? TENANT_ID,
                        }))
                      }
                      if (plan.kind === 'claim') {
                        events.push('claim:update')
                        return plan.claims
                      }
                      events.push('record:update')
                      return plan.updated === false ? [] : [{ id: 'updated' }]
                    }),
                  }
                }),
              }
            }),
          }
        }),
      }

      const result = await callback(client)
      events.push(`transaction:end:${plan.kind}`)
      return result
    }
  )
  const database = { client: { transaction } } as unknown as DatabaseService

  const auditProbe = {
    writeSemantic: vi.fn().mockImplementation(async () => {
      events.push('audit')
    }),
  }
  const audit = auditProbe as unknown as AuditService
  const failedPaths = new Set(options.failedPaths ?? [])
  const storageProbe = {
    remove: vi.fn().mockImplementation(async (path: string) => {
      events.push(`storage:${path}`)
      if (failedPaths.has(path)) throw new Error(`provider-secret:${path}`)
    }),
  }
  const storage = storageProbe as unknown as DocumentUploadReservationStorage
  const configValues: Record<string, unknown> = {
    ERP_DOCUMENT_UPLOAD_RESERVATION_CLEANUP_ENABLED: options.enabled ?? true,
    ERP_DOCUMENT_UPLOAD_RESERVATION_CLEANUP_TENANT_IDS:
      options.tenantIds ?? [TENANT_ID],
  }
  const config = {
    get: vi.fn((key: string) => configValues[key]),
  } as unknown as ConfigService<Environment, true>

  return {
    service: new DocumentUploadReservationCleanupService(
      config,
      database,
      audit,
      storage
    ),
    transaction,
    audit: auditProbe,
    storage: storageProbe,
    events,
    limits,
    lockArguments,
    updatePayloads,
    wherePredicates,
    remainingPlans: plans,
  }
}

describe('DocumentUploadReservationCleanupService', () => {
  it('fails closed without opening a transaction or touching Storage', async () => {
    const probe = makeHarness({ enabled: false })

    await expect(probe.service.runBatch()).resolves.toEqual({
      status: 'ignored',
      expired: 0,
      claimed: 0,
      removed: 0,
      failed: 0,
      cleanupRetries: 0,
      exhausted: 0,
      oldestExpiredAgeSeconds: 0,
    })
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.storage.remove).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('fails closed when enabled without an exact tenant allowlist', async () => {
    const probe = makeHarness({ enabled: true, tenantIds: [] })

    await expect(probe.service.runBatch()).resolves.toMatchObject({
      status: 'ignored',
      expired: 0,
      claimed: 0,
      removed: 0,
      failed: 0,
      cleanupRetries: 0,
      exhausted: 0,
      oldestExpiredAgeSeconds: 0,
    })
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('expires after project locking, deletes only claimed paths outside transactions, and stores bounded outcomes', async () => {
    const releasedPath = `${TENANT_ID}/${PROJECT_ID}/reservations/${uuid(1)}/plan.pdf`
    const expiredPath = `${TENANT_ID}/${PROJECT_ID}/reservations/${uuid(2)}/photo.jpg`
    const claims: Claim[] = [
      {
        id: uuid(1),
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: releasedPath,
        attempt: 1,
      },
      {
        id: uuid(2),
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: expiredPath,
        attempt: 2,
      },
    ]
    const probe = makeHarness({
      plans: [
        {
          kind: 'expire',
          candidates: [{ id: uuid(2), projectId: PROJECT_ID }],
          expiredIds: [uuid(2)],
        },
        { kind: 'claim', claims: [claims[0]!] },
        { kind: 'record' },
        { kind: 'claim', claims: [claims[1]!] },
        { kind: 'record' },
        { kind: 'claim', claims: [] },
      ],
      failedPaths: [expiredPath],
    })

    await expect(probe.service.runBatch()).resolves.toEqual({
      status: 'succeeded',
      expired: 1,
      claimed: 2,
      removed: 1,
      failed: 1,
      cleanupRetries: 1,
      exhausted: 0,
      oldestExpiredAgeSeconds: expect.any(Number),
    })

    expect(probe.storage.remove).toHaveBeenNthCalledWith(1, releasedPath)
    expect(probe.storage.remove).toHaveBeenNthCalledWith(2, expiredPath)
    expect(probe.events.indexOf('expire:project-lock')).toBeLessThan(
      probe.events.indexOf('expire:update')
    )
    expect(probe.events.indexOf('transaction:end:claim')).toBeLessThan(
      probe.events.indexOf(`storage:${releasedPath}`)
    )
    expect(probe.lockArguments).toContainEqual(['update'])
    expect(probe.lockArguments).toContainEqual(['update', { skipLocked: true }])

    const predicates = probe.wherePredicates.map((predicate) =>
      new PgDialect().sqlToQuery(predicate)
    )
    const claimPredicate = predicates.find(({ sql }) =>
      sql.includes('cleanup_claimed_at')
    )
    expect(claimPredicate?.sql).toContain('"state" in')
    expect(claimPredicate?.sql).toContain('"cleanup_completed_at" is null')
    expect(claimPredicate?.sql).toContain('"cleanup_claimed_at" is null')
    expect(claimPredicate?.sql).toContain("interval '1 minute'")
    expect(claimPredicate?.sql).toMatch(
      /"cleanup_last_error_code" is null or .*"cleanup_attempt_count" < /
    )
    expect(claimPredicate?.params).toEqual(
      expect.arrayContaining([
        'released',
        'expired',
        DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
        5,
        60,
      ])
    )

    const audits = probe.audit.writeSemantic.mock.calls.map((call) => call[1])
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: null,
          diff: expect.objectContaining({
            operation: 'cleanup_expire_due',
            reservation_count: 1,
            reservation_ids_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
        expect.objectContaining({
          actorId: null,
          entityId: uuid(1),
          diff: expect.objectContaining({
            operation: 'cleanup',
            outcome: 'succeeded',
            attempt: 1,
          }),
        }),
        expect.objectContaining({
          actorId: null,
          entityId: uuid(2),
          diff: expect.objectContaining({
            operation: 'cleanup',
            outcome: 'failed',
            error_code: 'STORAGE_REMOVE_FAILED',
            attempt: 2,
            retry_state: 'scheduled',
          }),
        }),
      ])
    )
    expect(JSON.stringify(audits)).not.toContain('provider-secret')
    expect(JSON.stringify(audits)).not.toContain('/reservations/')
    const traceIds = new Set(
      audits.map((entry) => (entry.diff as { trace_id: string }).trace_id)
    )
    expect([...traceIds]).toEqual([expect.stringMatching(/^[a-f0-9-]{36}$/)])
    expect(probe.updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cleanup_completed_at: expect.anything() }),
        expect.objectContaining({
          cleanup_last_error_code: 'STORAGE_REMOVE_FAILED',
        }),
      ])
    )
    expect(probe.remainingPlans).toHaveLength(0)
  })

  it('applies each phase batch limit globally across the exact tenant allowlist', async () => {
    const claims: Claim[] = Array.from(
      { length: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE },
      (_, index) => {
        const tenantId =
          index === DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE - 1
            ? SECOND_TENANT_ID
            : TENANT_ID
        return {
          id: uuid(index + 100),
          tenantId,
          projectId: PROJECT_ID,
          storagePath: `${tenantId}/${PROJECT_ID}/reservations/${uuid(
            index + 100
          )}/item.pdf`,
          attempt: 1,
        }
      }
    )
    const candidates = claims.map(({ id, tenantId }) => ({
      id,
      tenantId,
      projectId: PROJECT_ID,
    }))
    const probe = makeHarness({
      tenantIds: [TENANT_ID, TENANT_ID, SECOND_TENANT_ID],
      plans: [
        {
          kind: 'expire',
          candidates,
          expiredIds: candidates.map(({ id }) => id),
        },
        ...claims.flatMap((claim) => [
          { kind: 'claim', claims: [claim] } as const,
          { kind: 'record' } as const,
        ]),
      ],
    })

    await expect(probe.service.runBatch()).resolves.toMatchObject({
      status: 'succeeded',
      expired: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
      claimed: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
      removed: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
      failed: 0,
    })

    expect(probe.limits).toEqual([
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
      ...Array.from(
        { length: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE },
        () => 1
      ),
    ])
    expect(probe.storage.remove).toHaveBeenCalledTimes(
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE
    )
    expect(probe.remainingPlans).toHaveLength(0)
  })

  it('recovers a max-attempt claim when successful removal loses durable finalization', async () => {
    const storagePath = `${TENANT_ID}/${PROJECT_ID}/reservations/${uuid(
      900
    )}/item.pdf`
    const probe = makeHarness({
      plans: [
        { kind: 'expire', candidates: [], expiredIds: [] },
        {
          kind: 'claim',
          claims: [
            {
              id: uuid(900),
              tenantId: TENANT_ID,
              projectId: PROJECT_ID,
              storagePath,
              attempt: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
            },
          ],
        },
        { kind: 'record', updated: false },
      ],
    })

    await expect(probe.service.runBatch()).rejects.toThrow(
      'document_upload_cleanup_claim_lost'
    )
    expect(probe.storage.remove).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        diff: expect.objectContaining({ outcome: 'failed' }),
      })
    )
    expect(probe.remainingPlans).toHaveLength(0)

    probe.remainingPlans.push(
      { kind: 'expire', candidates: [], expiredIds: [] },
      {
        kind: 'claim',
        claims: [
          {
            id: uuid(900),
            tenantId: TENANT_ID,
            projectId: PROJECT_ID,
            storagePath,
            attempt: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS + 1,
          },
        ],
      },
      { kind: 'record' },
      { kind: 'claim', claims: [] }
    )

    await expect(probe.service.runBatch()).resolves.toMatchObject({
      status: 'succeeded',
      claimed: 1,
      removed: 1,
      failed: 0,
      cleanupRetries: 1,
      exhausted: 0,
    })
    expect(probe.storage.remove).toHaveBeenCalledTimes(2)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityId: uuid(900),
        diff: expect.objectContaining({
          outcome: 'succeeded',
          attempt: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS + 1,
        }),
      })
    )
    expect(probe.remainingPlans).toHaveLength(0)
  })

  it('caps persistent provider failures and records exhausted retry evidence', async () => {
    const storagePath = `${TENANT_ID}/${PROJECT_ID}/reservations/${uuid(
      901
    )}/item.pdf`
    const probe = makeHarness({
      plans: [
        { kind: 'expire', candidates: [], expiredIds: [] },
        {
          kind: 'claim',
          claims: [
            {
              id: uuid(901),
              tenantId: TENANT_ID,
              projectId: PROJECT_ID,
              storagePath,
              attempt: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
            },
          ],
        },
        { kind: 'record' },
        { kind: 'claim', claims: [] },
      ],
      failedPaths: [storagePath],
    })

    await expect(probe.service.runBatch()).resolves.toMatchObject({
      status: 'succeeded',
      claimed: 1,
      removed: 0,
      failed: 1,
      cleanupRetries: 1,
      exhausted: 1,
    })
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityId: uuid(901),
        diff: expect.objectContaining({
          error_code: 'STORAGE_REMOVE_FAILED',
          attempt: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
          retry_state: 'exhausted',
        }),
      })
    )
    expect(probe.remainingPlans).toHaveLength(0)
  })
})
