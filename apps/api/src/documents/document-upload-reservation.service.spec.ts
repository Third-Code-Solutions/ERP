import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  documentUploadReservations,
  lockProjectDocumentStorageUsage,
  projects,
  users,
} from '@third-code-erp/database'
import { PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES } from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { Environment } from '../config/environment'
import type { DatabaseService } from '../database/database.service'
import { DocumentUploadReservationService } from './document-upload-reservation.service'
import type { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

vi.mock('@third-code-erp/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/database')>()
  return { ...actual, lockProjectDocumentStorageUsage: vi.fn() }
})

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const EXISTING_RESERVATION_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  projectId: PROJECT_ID,
  fileName: 'Site plan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1_024,
  description: 'Approved plan',
}

type ReservationRecord = {
  id: string
  projectId: string
  storagePath: string
  originalFileName: string
  declaredSizeBytes: number
  declaredContentType: string
  requestHash: string
  state: 'active' | 'completed' | 'released' | 'expired'
  expiresAt: Date
}

type HarnessOptions = {
  issuanceEnabled?: boolean
  issuanceTenantIds?: string[]
  writesEnabled?: boolean
  writeTenantIds?: string[]
  membership?: boolean
  project?: boolean
  projectStatus?: 'lead' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  usageBytes?: bigint
  existing?: ReservationRecord | null
  expiredDueIds?: string[]
  signingFails?: boolean
  signingOutcomes?: Array<'failed' | 'succeeded'>
  stateDuringSign?: 'completed' | 'released' | 'expired'
}

function queryRows(rows: readonly unknown[]) {
  const lock = vi.fn().mockResolvedValue(rows)
  return {
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ for: lock }),
    }),
  }
}

function makeHarness(options: HarnessOptions = {}) {
  const events: string[] = []
  const insertedValues: Record<string, unknown>[] = []
  let existing = options.existing ?? null
  const membershipRows =
    options.membership === false
      ? []
      : [
          {
            tenantId: TENANT_ID,
            role: PRINCIPAL.role,
            email: PRINCIPAL.email,
          },
        ]
  const projectRows =
    options.project === false ||
    (options.projectStatus ?? 'active') !== 'active'
      ? []
      : [{ id: PROJECT_ID }]

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === users) return queryRows(membershipRows)
      if (table === projects) return queryRows(projectRows)
      if (table === documentUploadReservations) {
        return queryRows(existing ? [existing] : [])
      }
      throw new Error('unexpected_select_table')
    }),
  }))

  const update = vi.fn().mockImplementation((table: unknown) => {
    if (table !== documentUploadReservations) {
      throw new Error('unexpected_update_table')
    }
    return {
      set: vi.fn().mockImplementation(
        (payload: {
          state?: ReservationRecord['state']
          terminal_at?: unknown
          updated_at?: unknown
        }) => ({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(async () => {
              if (payload.state === 'expired') {
                events.push('expire_due')
                return (options.expiredDueIds ?? []).map((id) => ({ id }))
              }
              if (existing && payload.state === 'released') {
                existing = { ...existing, state: payload.state }
                events.push(`terminal:${payload.state}`)
                return [{ id: existing.id }]
              }
              events.push('expire_due')
              return (options.expiredDueIds ?? []).map((id) => ({ id }))
            }),
          }),
        })
      ),
    }
  })

  const insert = vi.fn().mockImplementation((table: unknown) => {
    if (table !== documentUploadReservations) {
      throw new Error('unexpected_insert_table')
    }
    return {
      values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertedValues.push(payload)
        existing = {
          id: String(payload.id),
          projectId: String(payload.project_id),
          storagePath: String(payload.storage_path),
          originalFileName: String(payload.original_file_name),
          declaredSizeBytes: Number(payload.declared_size_bytes),
          declaredContentType: String(payload.declared_content_type),
          requestHash: String(payload.request_hash),
          state: 'active',
          expiresAt: payload.expires_at as Date,
        }
        return {
          returning: vi.fn().mockImplementation(async () => [
            {
              id: existing!.id,
              projectId: existing!.projectId,
              storagePath: existing!.storagePath,
              originalFileName: existing!.originalFileName,
              declaredSizeBytes: existing!.declaredSizeBytes,
              declaredContentType: existing!.declaredContentType,
              expiresAt: existing!.expiresAt,
            },
          ]),
        }
      }),
    }
  })

  const transactionClient = {
    execute: vi.fn().mockResolvedValue([]),
    insert,
    select,
    update,
  }
  let transactionTail: Promise<void> = Promise.resolve()
  const transaction = vi.fn().mockImplementation(
    (callback: (value: typeof transactionClient) => Promise<unknown>) => {
      const run = transactionTail.then(async () => {
        events.push('transaction:begin')
        const result = await callback(transactionClient)
        events.push('transaction:commit')
        return result
      })
      transactionTail = run.then(
        () => undefined,
        () => undefined
      )
      return run
    }
  )
  const database = { client: { transaction } } as unknown as DatabaseService

  const auditProbe = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockImplementation(async () => {
      events.push('audit')
    }),
  }
  const audit = auditProbe as unknown as AuditService

  const storageProbe = {
    createSignedUpload: vi.fn().mockImplementation(async (storagePath: string) => {
      events.push('storage:sign')
      const signingOutcome = options.signingOutcomes?.shift()
      if (options.signingFails || signingOutcome === 'failed') {
        throw new Error('raw provider detail')
      }
      if (existing && options.stateDuringSign) {
        existing = { ...existing, state: options.stateDuringSign }
      }
      return {
        signedUrl: 'https://storage.example.test/upload/signed',
        token: 'ephemeral-token',
        storagePath,
      }
    }),
  }
  const storage = storageProbe as unknown as DocumentUploadReservationStorage

  const values: Partial<Environment> = {
    ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_ENABLED:
      options.issuanceEnabled ?? true,
    ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_TENANT_IDS:
      options.issuanceTenantIds ?? [TENANT_ID],
    ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_ENABLED:
      options.writesEnabled ?? true,
    ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_TENANT_IDS:
      options.writeTenantIds ?? [TENANT_ID],
  }
  const config = {
    get: vi.fn((key: keyof Environment) => values[key]),
  } as unknown as ConfigService<Environment, true>

  vi.mocked(lockProjectDocumentStorageUsage).mockImplementation(async () => {
    events.push('quota')
    const totalBytes = options.usageBytes ?? 0n
    return {
      committedBytes: totalBytes,
      activeReservationBytes: 0n,
      totalBytes,
    }
  })

  return {
    audit: auditProbe,
    events,
    get existing() {
      return existing
    },
    insert,
    insertedValues,
    service: new DocumentUploadReservationService(
      config,
      database,
      audit,
      storage
    ),
    storage: storageProbe,
    transaction,
    update,
  }
}

describe('document upload reservation reserve authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { issuanceEnabled: false },
    { issuanceTenantIds: [] },
    { writesEnabled: false },
    { writeTenantIds: [] },
  ])('fails closed before database or Storage access: %j', async (options) => {
    const probe = makeHarness(options)

    await expect(
      probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.storage.createSignedUpload).not.toHaveBeenCalled()
  })

  it('creates and signs only after the audited transaction commits', async () => {
    const probe = makeHarness()

    await expect(
      probe.service.reserve(COMMAND, PRINCIPAL, ' reserve-1 ')
    ).resolves.toMatchObject({
      projectId: PROJECT_ID,
      originalFileName: COMMAND.fileName,
      declaredSizeBytes: COMMAND.sizeBytes,
      declaredContentType: COMMAND.mimeType,
      state: 'active',
      replayed: false,
    })

    expect(probe.existing?.storagePath).toMatch(
      new RegExp(
        `^${TENANT_ID}/${PROJECT_ID}/[0-9a-f-]+-Site_plan\\.pdf$`
      )
    )
    expect(probe.events.indexOf('expire_due')).toBeLessThan(
      probe.events.indexOf('quota')
    )
    expect(probe.events.indexOf('transaction:commit')).toBeLessThan(
      probe.events.indexOf('storage:sign')
    )
    const auditPayload = JSON.stringify(probe.audit.writeSemantic.mock.calls)
    expect(auditPayload).not.toContain('ephemeral-token')
    expect(auditPayload).not.toContain('storage.example.test')
    expect(auditPayload).not.toContain('reserve-1')
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'document_upload_reservation',
        action: 'query',
        diff: expect.objectContaining({
          operation: 'sign',
          outcome: 'succeeded',
        }),
      })
    )
  })

  it('replays the same active reservation without a second insert', async () => {
    const probe = makeHarness()

    const first = await probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-1')
    const second = await probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-1')

    expect(first.replayed).toBe(false)
    expect(second).toMatchObject({
      reservationId: first.reservationId,
      storagePath: first.storagePath,
      replayed: true,
    })
    expect(probe.insert).toHaveBeenCalledTimes(1)
    expect(probe.storage.createSignedUpload).toHaveBeenCalledTimes(2)
  })

  it('rejects idempotency-key aliasing before signing', async () => {
    const probe = makeHarness({
      existing: {
        id: EXISTING_RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${EXISTING_RESERVATION_ID}-plan.pdf`,
        originalFileName: 'plan.pdf',
        declaredSizeBytes: 10,
        declaredContentType: 'application/pdf',
        requestHash: '0'.repeat(64),
        state: 'active',
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    await expect(
      probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-1')
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.storage.createSignedUpload).not.toHaveBeenCalled()
  })

  it('accepts the exact quota boundary and rejects one byte over', async () => {
    const atBoundary = makeHarness({
      usageBytes:
        BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES) - BigInt(COMMAND.sizeBytes),
    })
    await expect(
      atBoundary.service.reserve(COMMAND, PRINCIPAL, 'reserve-boundary')
    ).resolves.toMatchObject({ replayed: false })

    const overBoundary = makeHarness({
      usageBytes:
        BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES) -
        BigInt(COMMAND.sizeBytes) +
        1n,
    })
    await expect(
      overBoundary.service.reserve(COMMAND, PRINCIPAL, 'reserve-over')
    ).rejects.toBeInstanceOf(PayloadTooLargeException)
    expect(overBoundary.insert).not.toHaveBeenCalled()
    expect(overBoundary.storage.createSignedUpload).not.toHaveBeenCalled()
  })

  it('persists and audits due expiry before quota accounting', async () => {
    const probe = makeHarness({
      expiredDueIds: [
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666',
      ],
    })

    await probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-expiry')

    expect(probe.events.indexOf('expire_due')).toBeLessThan(
      probe.events.indexOf('quota')
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'document_upload_reservation_batch',
        entityId: PROJECT_ID,
        diff: expect.objectContaining({ reservation_count: 2 }),
      })
    )
  })

  it('retains an active reservation when signing fails after commit', async () => {
    const probe = makeHarness({ signingFails: true })

    await expect(
      probe.service.reserve(COMMAND, PRINCIPAL, 'reserve-sign-failure')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)

    expect(probe.transaction).toHaveBeenCalledTimes(2)
    expect(probe.events).not.toContain('terminal:released')
    expect(probe.existing?.state).toBe('active')
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'document_upload_reservation',
        action: 'query',
        diff: expect.objectContaining({
          operation: 'sign',
          outcome: 'failed',
          state: 'active',
        }),
      })
    )
  })

  it('keeps the shared reservation active across mixed concurrent signing outcomes', async () => {
    const probe = makeHarness({
      signingOutcomes: ['succeeded', 'failed'],
    })

    const outcomes = await Promise.allSettled([
      probe.service.reserve(COMMAND, PRINCIPAL, 'same-key'),
      probe.service.reserve(COMMAND, PRINCIPAL, 'same-key'),
    ])

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1)
    expect(probe.insert).toHaveBeenCalledTimes(1)
    expect(probe.storage.createSignedUpload).toHaveBeenCalledTimes(2)
    expect(probe.existing?.state).toBe('active')
    expect(probe.events).not.toContain('terminal:released')
    const auditPayload = JSON.stringify(probe.audit.writeSemantic.mock.calls)
    expect(auditPayload).toContain('succeeded')
    expect(auditPayload).toContain('failed')
    expect(auditPayload).not.toContain('raw provider detail')
    expect(auditPayload).not.toContain('ephemeral-token')
  })

  it.each(['completed', 'released', 'expired'] as const)(
    'does not return an active credential after a concurrent %s transition',
    async (stateDuringSign) => {
      const probe = makeHarness({ stateDuringSign })

      await expect(
        probe.service.reserve(COMMAND, PRINCIPAL, `terminal-${stateDuringSign}`)
      ).rejects.toBeInstanceOf(GoneException)
      expect(probe.existing?.state).toBe(stateDuringSign)
      expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'query',
          diff: expect.objectContaining({
            operation: 'sign',
            outcome: 'succeeded',
            state: stateDuringSign,
          }),
        })
      )
    }
  )

  it('conceals missing projects and rejects revoked membership before signing', async () => {
    const missingProject = makeHarness({ project: false })
    await expect(
      missingProject.service.reserve(COMMAND, PRINCIPAL, 'reserve-project')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(missingProject.storage.createSignedUpload).not.toHaveBeenCalled()

    const revoked = makeHarness({ membership: false })
    await expect(
      revoked.service.reserve(COMMAND, PRINCIPAL, 'reserve-membership')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(revoked.storage.createSignedUpload).not.toHaveBeenCalled()
  })

  it.each(['lead', 'on_hold', 'completed', 'cancelled'] as const)(
    'rejects %s projects before Storage signing',
    async (projectStatus) => {
      const probe = makeHarness({ projectStatus })

      await expect(
        probe.service.reserve(COMMAND, PRINCIPAL, `reserve-${projectStatus}`)
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(probe.storage.createSignedUpload).not.toHaveBeenCalled()
    }
  )
})
