import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentDeleteService } from './document-delete.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

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

describe('DocumentDeleteService migration boundary', () => {
  it.each(['claim', 'KYC artifact'])('retains referenced %s evidence before attempting destructive deletion', async (kind) => {
    const rows = [
      [{ tenantId: PRINCIPAL.tenantId, role: 'pm', email: PRINCIPAL.email }],
      [{ id: DOCUMENT_ID, documentId: DOCUMENT_ID, requestHash: createHash('sha256').update(JSON.stringify({ action: 'delete', command: { documentId: DOCUMENT_ID } })).digest('hex'), state: 'processing', result: null }],
      [{ id: DOCUMENT_ID, tenantId: PRINCIPAL.tenantId, projectId: null, storagePath: 'synthetic.pdf' }],
      ...(kind === 'KYC artifact' ? [[]] : []),
      [{ id: '55555555-5555-4555-8555-555555555555' }],
    ]
    const select = vi.fn(() => {
      const response = rows.shift() ?? []
      const query = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), for: vi.fn() }
      query.from.mockReturnValue(query)
      query.where.mockReturnValue(query)
      query.limit.mockReturnValue(Object.assign(Promise.resolve(response), { for: query.for }))
      query.for.mockResolvedValue(response)
      return query
    })
    const remove = vi.fn()
    const tx = { select, delete: remove, insert: vi.fn().mockReturnValue({ values: () => ({ onConflictDoNothing: async () => {} }) }) }
    // Partial transaction double proves early rejection; integration proves persisted evidence is unchanged.
    const database = { client: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) } } as unknown as DatabaseService
    const config = { get: (key: string) => key === 'ERP_DOCUMENT_DELETE_WRITES_ENABLED' ? true : [PRINCIPAL.tenantId] } as unknown as ConfigService
    const audit = { stampActor: vi.fn() } as unknown as AuditService
    await expect(new DocumentDeleteService(config, database, audit).delete(DOCUMENT_ID, PRINCIPAL, 'evidence-retention')).rejects.toThrow(`Document is attached to a ${kind} and cannot be deleted`)
    expect(remove).not.toHaveBeenCalled()
  })

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
})
