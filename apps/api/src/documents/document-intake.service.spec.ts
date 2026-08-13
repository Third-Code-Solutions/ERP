import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  documentIntakeRequests,
  documents,
} from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentIntakeService } from './document-intake.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

const COMMAND = {
  storagePath: `${PRINCIPAL.tenantId}/${PROJECT_ID}/drawing.dwg`,
  projectId: PROJECT_ID,
  fileName: 'drawing.dwg',
  mimeType: 'application/octet-stream',
  sizeBytes: 1024,
  description: 'Approved drawing',
}

function disabledService(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_DOCUMENT_INTAKE_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new DocumentIntakeService(config, database, {} as AuditService),
    transaction,
  }
}

function enabledHarness() {
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
  const requestQuery = query([requestRecord])
  const projectQuery = query([{ id: PROJECT_ID }])
  let selectCalls = 0
  const select = vi.fn(() => {
    // Scope must be validated before the idempotency ledger is claimed.
    const query = [membershipQuery, projectQuery, requestQuery][selectCalls % 3]
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
      values: vi.fn().mockReturnValue({ returning: documentReturning }),
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
  const config = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'ERP_DOCUMENT_INTAKE_WRITES_ENABLED'
        ? true
        : key === 'ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS'
          ? [PRINCIPAL.tenantId]
          : fallback
    ),
  } as unknown as ConfigService

  return {
    service: new DocumentIntakeService(config, database, audit),
    transaction,
    select,
    insert,
    update,
    audit,
    requestRecord,
  }
}

describe('DocumentIntakeService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = disabledService()
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('requires an exact tenant allowlist before opening a transaction', async () => {
    const probe = disabledService(true)
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    ).rejects.toThrow(
      'Document intake workflow is not enabled for this tenant; no document was created.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
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
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'document',
        entityId: DOCUMENT_ID,
        action: 'create',
      })
    )
  })

  it('replays the committed result without inserting a second document', async () => {
    const probe = enabledHarness()
    const first = await probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    const second = await probe.service.create(COMMAND, PRINCIPAL, 'intake-1')
    expect(first.created).toBe(true)
    expect(second).toMatchObject({ documentId: DOCUMENT_ID, created: false })
    expect(probe.insert).toHaveBeenCalledTimes(3)
    expect(
      probe.insert.mock.calls.filter(([table]) => table === documents)
    ).toHaveLength(1)
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(1)
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
})
