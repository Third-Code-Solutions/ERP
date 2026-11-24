import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  cadEvidenceCommitRequests,
  documentDeleteRequests,
  documents,
  users,
} from '@third-code-erp/database/schema'
import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
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
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_HASH = createHash('sha256')
  .update(JSON.stringify({ action: 'delete', command: { documentId: DOCUMENT_ID } }))
  .digest('hex')

/** Transaction double that answers each select by the table it reads. */
function enabledHarness(cadEvidence: Array<{ id: string }>) {
  const rowsByTable = new Map<unknown, unknown[]>([
    [users, [{ tenantId: PRINCIPAL.tenantId, role: 'pm', email: PRINCIPAL.email }]],
    [documentDeleteRequests, [{ id: '66666666-6666-4666-8666-666666666666', documentId: DOCUMENT_ID, requestHash: REQUEST_HASH, state: 'processing', result: null }]],
    [documents, [{ id: DOCUMENT_ID, tenantId: PRINCIPAL.tenantId, projectId: PROJECT_ID, storagePath: 'synthetic.pdf' }]],
    [cadEvidenceCommitRequests, cadEvidence],
  ])
  const wheres = new Map<unknown, unknown>()
  const select = vi.fn(() => {
    let table: unknown
    const query = { from: vi.fn(), where: vi.fn(), limit: vi.fn() }
    query.from.mockImplementation((from: unknown) => { table = from; return query })
    query.where.mockImplementation((where: unknown) => { wheres.set(table, where); return query })
    query.limit.mockImplementation(() => {
      const response = rowsByTable.get(table) ?? []
      return Object.assign(Promise.resolve(response), { for: vi.fn().mockResolvedValue(response) })
    })
    return query
  })
  const deleted: unknown[] = []
  const remove = vi.fn((table: unknown) => ({
    where: () => ({
      returning: async () => {
        deleted.push(table)
        return table === documents ? [{ id: DOCUMENT_ID }] : []
      },
    }),
  }))
  const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'request' }] }) }) }))
  const tx = { select, delete: remove, update, insert: vi.fn().mockReturnValue({ values: () => ({ onConflictDoNothing: async () => {} }) }) }
  const database = { client: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) } } as unknown as DatabaseService
  const config = { get: (key: string) => key === 'ERP_DOCUMENT_DELETE_WRITES_ENABLED' ? true : [PRINCIPAL.tenantId] } as unknown as ConfigService
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  return {
    service: new DocumentDeleteService(config, database, audit as unknown as AuditService),
    wheres, deleted, update, audit,
  }
}

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
  it.each(['claim', 'KYC artifact', 'inspection photo', 'inspection report'])('retains referenced %s evidence before attempting destructive deletion', async (kind) => {
    const rows = [
      [{ tenantId: PRINCIPAL.tenantId, role: 'pm', email: PRINCIPAL.email }],
      [{ id: DOCUMENT_ID, documentId: DOCUMENT_ID, requestHash: createHash('sha256').update(JSON.stringify({ action: 'delete', command: { documentId: DOCUMENT_ID } })).digest('hex'), state: 'processing', result: null }],
      [{ id: DOCUMENT_ID, tenantId: PRINCIPAL.tenantId, projectId: null, storagePath: 'synthetic.pdf' }],
      ...Array.from({ length: ['claim', 'KYC artifact', 'inspection photo', 'inspection report'].indexOf(kind) }, () => []),
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
    await expect(new DocumentDeleteService(config, database, audit).delete(DOCUMENT_ID, PRINCIPAL, 'evidence-retention')).rejects.toThrow(kind.startsWith('inspection') ? 'Document is attached to an inspection and cannot be deleted' : `Document is attached to a ${kind} and cannot be deleted`)
    expect(remove).not.toHaveBeenCalled()
  })

  it('refuses a document with committed CAD evidence before deleting anything', async () => {
    const probe = enabledHarness([{ id: '55555555-5555-4555-8555-555555555555' }])

    const attempt = probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'cad-evidence-retention')
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toThrow('Document has committed CAD evidence and cannot be deleted')

    const predicate = probe.wheres.get(cadEvidenceCommitRequests)
    if (!(predicate instanceof SQL)) throw new Error('Expected a scoped CAD evidence predicate')
    const query = new PgDialect().sqlToQuery(predicate)
    expect(query.sql).toBe('("cad_evidence_commit_requests"."tenant_id" = $1 and "cad_evidence_commit_requests"."document_id" = $2)')
    expect(query.params).toEqual([PRINCIPAL.tenantId, DOCUMENT_ID])
    expect(probe.deleted).toEqual([])
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
  })

  it('still deletes and audits a document without CAD evidence', async () => {
    const probe = enabledHarness([])

    await expect(probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'cad-evidence-none')).resolves.toEqual({
      documentId: DOCUMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      storagePath: 'synthetic.pdf',
      status: 'deleted',
      derivedScopeItemsRemoved: 0,
    })
    expect(probe.wheres.has(cadEvidenceCommitRequests)).toBe(true)
    expect(probe.deleted).toContain(documents)
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()
    expect(probe.update).toHaveBeenCalledOnce()
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
