import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  documentDeleteRequests,
  documentProcessingJobs,
  documents,
  users,
} from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentDeleteService } from './document-delete.service'
import { lockProjectDocumentStorageForDelete } from './document-storage-quota'

vi.mock('./document-storage-quota', () => ({
  lockProjectDocumentStorageForDelete: vi.fn(),
}))

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_DOCUMENT_DELETE_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new DocumentDeleteService(config, database, {} as AuditService),
    transaction,
  }
}

function enabledService() {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_DOCUMENT_DELETE_WRITES_ENABLED' ? true : [PRINCIPAL.tenantId]
    ),
  } as unknown as ConfigService
  const request = {
    id: REQUEST_ID,
    documentId: DOCUMENT_ID,
    requestHash: '',
    state: 'processing' as 'processing' | 'succeeded',
    result: null as unknown,
  }
  const rows = new Map<unknown, unknown[]>([
    [
      users,
      [
        {
          tenantId: PRINCIPAL.tenantId,
          role: PRINCIPAL.role,
          email: PRINCIPAL.email,
        },
      ],
    ],
    [documentDeleteRequests, [request]],
    [
      documents,
      [
        {
          id: DOCUMENT_ID,
          tenantId: PRINCIPAL.tenantId,
          projectId: PROJECT_ID,
          storagePath: `${PRINCIPAL.tenantId}/${PROJECT_ID}/drawing.dwg`,
        },
      ],
    ],
    [documentProcessingJobs, []],
  ])
  const select = vi.fn(() => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    query.from = vi.fn((table: unknown) => {
      const selectedRows = rows.get(table) ?? []
      query.where = vi.fn().mockReturnValue(query)
      query.limit = vi.fn().mockReturnValue(query)
      query.for = vi.fn().mockResolvedValue(selectedRows)
      return query
    })
    return query
  })
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((payload: { request_hash?: string }) => {
      if (table === documentDeleteRequests) {
        request.requestHash = payload.request_hash ?? ''
      }
      return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
    }),
  }))
  const remove = vi.fn((table: unknown) => ({
    where: vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue(table === documents ? [{ id: DOCUMENT_ID }] : []),
    }),
  }))
  const update = vi.fn().mockReturnValue({
    set: vi.fn((payload: { result?: unknown }) => {
      request.state = 'succeeded'
      request.result = payload.result ?? null
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: REQUEST_ID }]),
        }),
      }
    }),
  })
  const transactionClient = { select, insert, delete: remove, update }
  const transaction = vi.fn(
    async (callback: (value: typeof transactionClient) => unknown) =>
      callback(transactionClient)
  )
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new DocumentDeleteService(
      config,
      { client: { transaction } } as unknown as DatabaseService,
      audit
    ),
    remove,
    audit,
  }
}

describe('DocumentDeleteService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()
    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).rejects.toThrow(
      'Document deletion workflow is not enabled for this tenant; no document was deleted.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('serializes a project-scoped deletion and replays without relocking', async () => {
    vi.mocked(lockProjectDocumentStorageForDelete).mockResolvedValue({
      committedBytes: 1n,
      activeReservationBytes: 0n,
      totalBytes: 1n,
    })
    const probe = enabledService()

    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).resolves.toMatchObject({ documentId: DOCUMENT_ID, status: 'deleted' })
    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).resolves.toMatchObject({ documentId: DOCUMENT_ID, status: 'deleted' })

    expect(lockProjectDocumentStorageForDelete).toHaveBeenCalledOnce()
    expect(lockProjectDocumentStorageForDelete).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: PRINCIPAL.tenantId, projectId: PROJECT_ID }
    )
    expect(probe.remove).toHaveBeenCalledWith(documents)
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()
  })
})
