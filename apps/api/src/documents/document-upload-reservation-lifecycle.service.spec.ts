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
  documents,
  documentUploadReservations,
  lockProjectDocumentStorageUsage,
  projects,
  users,
} from '@third-code-erp/database'
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES,
} from '@third-code-erp/shared-types'
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
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555'
const STORAGE_PATH = `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing.pdf`

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

type ReservationState = 'active' | 'completed' | 'released' | 'expired'

type ReservationRecord = {
  state: ReservationState
  documentId: string | null
  projectId: string
  storagePath: string
  originalFileName: string
  description: string | null
  declaredSizeBytes: number
  declaredContentType: string
}

type LinkedDocument = {
  id: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  description: string | null
  documentType: 'pdf'
}

type HarnessOptions = {
  writesEnabled?: boolean
  writeTenantIds?: string[]
  membership?: boolean
  project?: boolean
  projectStatus?: 'lead' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  reservation?: boolean
  state?: ReservationState
  expiredDue?: boolean
  info?: { sizeBytes: number; contentType: string }
  infoFails?: boolean
  usageBytes?: bigint
  linkedDocument?: boolean
  transitionSucceeds?: boolean
  stateBeforeTransaction?: ReservationState
}

function awaitableRows(rows: readonly unknown[]) {
  const promise = Promise.resolve(rows)
  return {
    for: vi.fn().mockResolvedValue(rows),
    then: promise.then.bind(promise),
  }
}

function queryRows(rows: readonly unknown[]) {
  return {
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue(awaitableRows(rows)),
    }),
  }
}

function makeHarness(options: HarnessOptions = {}) {
  const events: string[] = []
  let reservation: ReservationRecord | undefined =
    options.reservation === false
      ? undefined
      : {
          state: options.state ?? 'active',
          documentId:
            (options.state ?? 'active') === 'completed' ? DOCUMENT_ID : null,
          projectId: PROJECT_ID,
          storagePath: STORAGE_PATH,
          originalFileName: 'drawing.pdf',
          description: 'Issued drawing',
          declaredSizeBytes: 1_024,
          declaredContentType: 'application/pdf',
        }
  let linkedDocument: LinkedDocument | undefined =
    options.linkedDocument === false
      ? undefined
      : {
          id: DOCUMENT_ID,
          storagePath: STORAGE_PATH,
          fileName: 'drawing.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_024,
          description: 'Issued drawing',
          documentType: 'pdf' as const,
        }

  const rootSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue(
      queryRows(
        reservation
          ? [
              {
                state: reservation.state,
                projectId: reservation.projectId,
                storagePath: reservation.storagePath,
              },
            ]
          : []
      )
    ),
  })

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === users) {
        return queryRows(
          options.membership === false
            ? []
            : [
                {
                  tenantId: TENANT_ID,
                  role: PRINCIPAL.role,
                  email: PRINCIPAL.email,
                },
              ]
        )
      }
      if (table === projects) {
        return queryRows(
          options.project === false ||
            (options.projectStatus ?? 'active') !== 'active'
            ? []
            : [{ id: PROJECT_ID }]
        )
      }
      if (table === documentUploadReservations) {
        return queryRows(reservation ? [{ ...reservation }] : [])
      }
      if (table === documents) {
        return queryRows(linkedDocument ? [{ ...linkedDocument }] : [])
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
          state?: ReservationState
          document_id?: string
        }) => ({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(async () => {
              if (payload.state === 'expired') {
                events.push('reservation:expire')
                if (!reservation || !options.expiredDue) return []
                reservation = { ...reservation, state: 'expired' }
                return [{ id: RESERVATION_ID }]
              }
              if (!reservation || options.transitionSucceeds === false) return []
              if (payload.state === 'released') {
                events.push('reservation:release')
                reservation = { ...reservation, state: 'released' }
                return [{ id: RESERVATION_ID }]
              }
              if (payload.state === 'completed' && payload.document_id) {
                events.push('reservation:complete')
                reservation = {
                  ...reservation,
                  state: 'completed',
                  documentId: payload.document_id,
                }
                return [{ id: RESERVATION_ID }]
              }
              return []
            }),
          }),
        })
      ),
    }
  })

  const insert = vi.fn().mockImplementation((table: unknown) => {
    if (table !== documents) throw new Error('unexpected_insert_table')
    return {
      values: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
        returning: vi.fn().mockImplementation(async () => {
          events.push('document:insert')
          linkedDocument = {
            id: DOCUMENT_ID,
            storagePath: String(payload.storage_path),
            fileName: String(payload.file_name),
            mimeType: String(payload.mime_type),
            sizeBytes: Number(payload.size_bytes),
            description:
              typeof payload.description === 'string'
                ? payload.description
                : null,
            documentType: 'pdf',
          }
          return [{ ...linkedDocument }]
        }),
      })),
    }
  })

  const transactionClient = {
    execute: vi.fn().mockResolvedValue([]),
    insert,
    select,
    update,
  }
  const transaction = vi.fn().mockImplementation(
    async (callback: (value: typeof transactionClient) => Promise<unknown>) => {
      events.push('transaction:begin')
      if (reservation && options.stateBeforeTransaction) {
        reservation = {
          ...reservation,
          state: options.stateBeforeTransaction,
        }
      }
      const result = await callback(transactionClient)
      events.push('transaction:commit')
      return result
    }
  )
  const database = {
    client: { select: rootSelect, transaction },
  } as unknown as DatabaseService

  const auditProbe = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockImplementation(async () => {
      events.push('audit')
    }),
  }
  const audit = auditProbe as unknown as AuditService

  const storageProbe = {
    createSignedUpload: vi.fn(),
    info: vi.fn().mockImplementation(async () => {
      events.push('storage:info')
      if (options.infoFails) throw new ServiceUnavailableException()
      return (
        options.info ?? {
          sizeBytes: 1_024,
          contentType: 'application/pdf',
        }
      )
    }),
    remove: vi.fn(),
  }
  const storage = storageProbe as unknown as DocumentUploadReservationStorage

  const values: Partial<Environment> = {
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
    const totalBytes = options.usageBytes ?? 1_024n
    return {
      committedBytes: 0n,
      activeReservationBytes: totalBytes,
      totalBytes,
    }
  })

  return {
    audit: auditProbe,
    events,
    get reservation() {
      return reservation
    },
    insert,
    rootSelect,
    service: new DocumentUploadReservationService(
      config,
      database,
      audit,
      storage
    ),
    storage: storageProbe,
    transaction,
  }
}

describe('document upload reservation lifecycle authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { writesEnabled: false },
    { writeTenantIds: [] },
  ])('fails closed before database or Storage access: %j', async (options) => {
    const probe = makeHarness(options)

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.rootSelect).not.toHaveBeenCalled()
    expect(probe.storage.info).not.toHaveBeenCalled()
  })

  it('verifies provider metadata before the final atomic completion transaction', async () => {
    const probe = makeHarness()

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).resolves.toMatchObject({
      reservationId: RESERVATION_ID,
      documentId: DOCUMENT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      state: 'completed',
      created: true,
      replayed: false,
    })
    expect(probe.events.indexOf('storage:info')).toBeLessThan(
      probe.events.indexOf('transaction:begin')
    )
    expect(probe.events.indexOf('document:insert')).toBeLessThan(
      probe.events.indexOf('reservation:complete')
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(2)
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it('replays a completed reservation without a provider call or second insert', async () => {
    const probe = makeHarness({ state: 'completed' })

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).resolves.toMatchObject({
      documentId: DOCUMENT_ID,
      created: false,
      replayed: true,
    })
    expect(probe.storage.info).not.toHaveBeenCalled()
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it.each([
    { info: { sizeBytes: 1_025, contentType: 'application/pdf' } },
    { info: { sizeBytes: 1_024, contentType: 'image/png' } },
    {
      info: {
        sizeBytes: DOCUMENT_UPLOAD_MAX_BYTES + 1,
        contentType: 'application/pdf',
      },
    },
  ])('releases a reservation after verified metadata mismatch: %j', async (options) => {
    const probe = makeHarness(options)

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.reservation?.state).toBe('released')
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        diff: expect.objectContaining({ outcome: 'metadata_mismatch' }),
      })
    )
  })

  it('fails closed on provider metadata failure before opening a transaction', async () => {
    const probe = makeHarness({ infoFails: true })

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('rejects a defensive quota overage without double-counting object bytes', async () => {
    const atBoundary = makeHarness({
      usageBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES),
    })
    await expect(
      atBoundary.service.complete(RESERVATION_ID, PRINCIPAL)
    ).resolves.toMatchObject({ state: 'completed' })

    const overBoundary = makeHarness({
      usageBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES) + 1n,
    })
    await expect(
      overBoundary.service.complete(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(PayloadTooLargeException)
    expect(overBoundary.insert).not.toHaveBeenCalled()
  })

  it('fails completion when the terminal compare-and-set loses its race', async () => {
    const probe = makeHarness({ transitionSucceeds: false })

    await expect(
      probe.service.complete(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.events).toContain('document:insert')
    expect(probe.events).not.toContain('reservation:complete')
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it.each(['released', 'expired'] as const)(
    'rejects terminal %s completion without provider access',
    async (state) => {
      const probe = makeHarness({ state })

      await expect(
        probe.service.complete(RESERVATION_ID, PRINCIPAL)
      ).rejects.toBeInstanceOf(GoneException)
      expect(probe.storage.info).not.toHaveBeenCalled()
      expect(probe.insert).not.toHaveBeenCalled()
    }
  )

  it.each(['released', 'expired'] as const)(
    'labels a concurrent %s terminal transition as a replay',
    async (stateBeforeTransaction) => {
      const probe = makeHarness({ stateBeforeTransaction })

      await expect(
        probe.service.release(RESERVATION_ID, PRINCIPAL)
      ).resolves.toMatchObject({
        state: stateBeforeTransaction,
        replayed: true,
      })
    }
  )

  it('atomically releases an active reservation without deleting Storage', async () => {
    const probe = makeHarness()

    await expect(
      probe.service.release(RESERVATION_ID, PRINCIPAL)
    ).resolves.toMatchObject({
      reservationId: RESERVATION_ID,
      state: 'released',
      replayed: false,
    })
    expect(probe.reservation?.state).toBe('released')
    expect(probe.storage.info).not.toHaveBeenCalled()
    expect(probe.storage.remove).not.toHaveBeenCalled()
  })

  it.each(['released', 'expired'] as const)(
    'replays a terminal %s release',
    async (state) => {
      const probe = makeHarness({ state })

      await expect(
        probe.service.release(RESERVATION_ID, PRINCIPAL)
      ).resolves.toMatchObject({ state, replayed: true })
      expect(probe.storage.remove).not.toHaveBeenCalled()
    }
  )

  it('persists request-path expiry and reports it without releasing', async () => {
    const probe = makeHarness({ expiredDue: true })

    await expect(
      probe.service.release(RESERVATION_ID, PRINCIPAL)
    ).resolves.toMatchObject({ state: 'expired', replayed: false })
    expect(probe.reservation?.state).toBe('expired')
    expect(probe.events).not.toContain('reservation:release')
  })

  it('rejects completed release, missing reservation, inactive project, and revoked membership', async () => {
    const completed = makeHarness({ state: 'completed' })
    await expect(
      completed.service.release(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)

    const missing = makeHarness({ reservation: false })
    await expect(
      missing.service.release(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)

    const inactiveProject = makeHarness({ project: false })
    await expect(
      inactiveProject.service.release(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)

    const revoked = makeHarness({ membership: false })
    await expect(
      revoked.service.release(RESERVATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each(['lead', 'on_hold', 'completed', 'cancelled'] as const)(
    'rejects lifecycle writes after a project becomes %s',
    async (projectStatus) => {
      const complete = makeHarness({ projectStatus })
      await expect(
        complete.service.complete(RESERVATION_ID, PRINCIPAL)
      ).rejects.toBeInstanceOf(NotFoundException)

      const release = makeHarness({ projectStatus })
      await expect(
        release.service.release(RESERVATION_ID, PRINCIPAL)
      ).rejects.toBeInstanceOf(NotFoundException)
    }
  )
})
