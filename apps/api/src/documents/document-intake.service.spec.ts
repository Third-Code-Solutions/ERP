import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  documentIntakeRequests,
  documents,
} from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentIntakeService } from './document-intake.service'
import { lockProjectDocumentStorageForCreate } from './document-storage-quota'

vi.mock('./document-storage-quota', () => ({
  lockProjectDocumentStorageForCreate: vi.fn(),
}))

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const OPPORTUNITY_ID = '66666666-6666-4666-8666-666666666666'

const COMMAND = {
  storagePath: `${PRINCIPAL.tenantId}/${PROJECT_ID}/drawing.dwg`,
  projectId: PROJECT_ID,
  fileName: 'drawing.dwg',
  mimeType: 'application/octet-stream',
  sizeBytes: 1024,
  description: 'Approved drawing',
}

function enabledHarness(options?: { opportunityRows?: Array<{ id: string }> }) {
  const membershipRows = [
    {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    },
  ]
  const requestRecord = {
    id: REQUEST_ID,
    requestHash: '',
    state: 'processing' as 'processing' | 'succeeded',
    result: null as unknown,
  }
  const query = (rows: unknown[]) => {
    const lock = vi.fn().mockResolvedValue(rows)
    const limit = vi.fn().mockReturnValue({ for: lock })
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    return { from, lock }
  }
  const membershipQuery = query(membershipRows)
  const projectQuery = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]),
      }),
    }),
  }
  const opportunityForUpdate = vi
    .fn()
    .mockResolvedValue(options?.opportunityRows ?? [])
  const opportunityQuery = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          for: opportunityForUpdate,
        }),
      }),
    }),
  }
  const requestQuery = query([requestRecord])
  let selectCalls = 0
  const select = vi.fn(() => {
    const queries = options
      ? [membershipQuery, projectQuery, opportunityQuery, requestQuery]
      : [membershipQuery, projectQuery, requestQuery]
    const query = queries[selectCalls % queries.length]
    selectCalls += 1
    return query
  })

  const documentReturning = vi.fn().mockResolvedValue([{ id: DOCUMENT_ID }])
  const completeReturning = vi
    .fn()
    .mockImplementation(async () => {
      requestRecord.state = 'succeeded'
      return [{ id: REQUEST_ID }]
    })
  const update = vi.fn().mockReturnValue({
    set: vi.fn((payload: { result?: unknown }) => {
      requestRecord.result = payload.result ?? null
      return {
        where: vi.fn().mockReturnValue({ returning: completeReturning }),
      }
    }),
  })
  const requestConflict = vi.fn().mockResolvedValue(undefined)
  const documentValues = vi
    .fn()
    .mockReturnValue({ returning: documentReturning })
  const insert = vi.fn((table: unknown) => {
    if (table === documentIntakeRequests) {
      return {
        values: vi.fn((payload: { request_hash?: string }) => {
          requestRecord.requestHash = payload.request_hash ?? ''
          return { onConflictDoNothing: requestConflict }
        }),
      }
    }
    return {
      values: documentValues,
    }
  })
  const transactionClient = { select, insert, update }
  const transaction = vi
    .fn()
    .mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient)
    )
  const database = { client: { transaction } } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new DocumentIntakeService(database, audit),
    transaction,
    select,
    insert,
    update,
    audit,
    requestRecord,
    documentValues,
    opportunityForUpdate,
  }
}

describe('DocumentIntakeService Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lockProjectDocumentStorageForCreate)
      .mockReset()
      .mockResolvedValue({
        committedBytes: 0n,
        activeReservationBytes: 0n,
        totalBytes: 0n,
      })
  })

  it('creates one tenant-scoped document and records an audit event', async () => {
    const probe = enabledHarness()
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, ' intake-1 ')
    ).resolves.toMatchObject({
      documentId: DOCUMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      documentType: 'dxf',
      created: true,
    })
    expect(probe.insert).toHaveBeenCalledWith(documentIntakeRequests)
    expect(probe.insert).toHaveBeenCalledWith(documents)
    expect(lockProjectDocumentStorageForCreate).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: PRINCIPAL.tenantId, projectId: PROJECT_ID },
      COMMAND.sizeBytes
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'document',
        entityId: DOCUMENT_ID,
        action: 'create',
        diff: expect.objectContaining({
          request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          idempotency_key_hash: createHash('sha256')
            .update('intake-1')
            .digest('hex'),
        }),
      })
    )
  })

  it('replays the committed result without inserting a second document', async () => {
    const probe = enabledHarness()
    const first = await probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    vi.mocked(lockProjectDocumentStorageForCreate).mockRejectedValueOnce(
      new Error('quota should not be consulted for a committed replay')
    )
    const second = await probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    expect(first.created).toBe(true)
    expect(second).toMatchObject({ documentId: DOCUMENT_ID, created: false })
    expect(probe.insert).toHaveBeenCalledTimes(3)
    expect(
      probe.insert.mock.calls.filter(([table]) => table === documents)
    ).toHaveLength(1)
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(1)
    expect(lockProjectDocumentStorageForCreate).toHaveBeenCalledTimes(1)
  })

  it('rejects a storage path outside the verified tenant/project scope', async () => {
    const probe = enabledHarness()
    await expect(
      probe.service.create(
        { ...COMMAND, storagePath: `other/${PROJECT_ID}/drawing.dwg` },
        PRINCIPAL,
        'intake-2'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects a traversal segment even when the raw prefix matches', async () => {
    const probe = enabledHarness()
    await expect(
      probe.service.create(
        {
          ...COMMAND,
          storagePath: `${PRINCIPAL.tenantId}/${PROJECT_ID}/../other/drawing.dwg`,
        },
        PRINCIPAL,
        'intake-3'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('persists an opportunity association verified within the tenant project', async () => {
    const probe = enabledHarness({
      opportunityRows: [{ id: OPPORTUNITY_ID }],
    })
    await expect(
      probe.service.create(
        { ...COMMAND, opportunityId: OPPORTUNITY_ID },
        PRINCIPAL,
        'intake-opportunity-1'
      )
    ).resolves.toMatchObject({ documentId: DOCUMENT_ID, created: true })
    expect(probe.documentValues).toHaveBeenCalledWith(
      expect.objectContaining({ opportunity_id: OPPORTUNITY_ID })
    )
    expect(probe.opportunityForUpdate).toHaveBeenCalledWith('update')
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        diff: expect.objectContaining({
          opportunity_id: OPPORTUNITY_ID,
          request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          idempotency_key_hash: createHash('sha256')
            .update('intake-opportunity-1')
            .digest('hex'),
        }),
      })
    )
  })

  it('conceals an opportunity outside the verified tenant project', async () => {
    const probe = enabledHarness({ opportunityRows: [] })
    await expect(
      probe.service.create(
        { ...COMMAND, opportunityId: OPPORTUNITY_ID },
        PRINCIPAL,
        'intake-opportunity-2'
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(lockProjectDocumentStorageForCreate).not.toHaveBeenCalled()
  })
})
