import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { projectSubmittalDocuments } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectSubmittalDocumentsService } from './project-submittal-documents.service'

const PRINCIPAL: ErpPrincipal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm', email: 'pm@example.test' }
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const LINK_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.innerJoin = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.offset = vi.fn().mockReturnValue(builder)
  builder.orderBy = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(result)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function linkRow() {
  return {
    id: LINK_ID,
    projectId: PROJECT_ID,
    submittalId: SUBMITTAL_ID,
    documentId: DOCUMENT_ID,
    role: 'plan',
    caption: 'M-202',
    fileName: 'M-202.pdf',
    documentType: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 42,
    description: null,
    linkedBy: PRINCIPAL.userId,
    createdAt: CREATED_AT,
  }
}

function harness(selectResults: unknown[], options?: { insertResult?: unknown[]; updateResult?: unknown[]; deleteResult?: unknown[] }) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertQuery: Record<string, unknown> = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.insertResult ?? [{ id: LINK_ID }]) }
  const updateQuery: Record<string, unknown> = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.updateResult ?? [{ version: 2 }]) }
  const deleteQuery: Record<string, unknown> = { where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.deleteResult ?? [{ id: LINK_ID }]) }
  const insert = vi.fn().mockReturnValue(insertQuery)
  const update = vi.fn().mockReturnValue(updateQuery)
  const deleteFn = vi.fn().mockReturnValue(deleteQuery)
  const transactionClient = { select, insert, update, delete: deleteFn }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = { stampActor: vi.fn().mockResolvedValue(undefined), writeSemantic: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService
  return { service: new ProjectSubmittalDocumentsService(database, audit), audit, insert, update, deleteFn }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const submittal = [{ version: 1, status: 'draft' }]

describe('ProjectSubmittalDocumentsService', () => {
  it('links a project document with a version bump and append-only audit events', async () => {
    const probe = harness([membership, submittal, [], [{ id: DOCUMENT_ID }], [], [linkRow()]])
    await expect(probe.service.link(PROJECT_ID, SUBMITTAL_ID, { documentId: DOCUMENT_ID, role: 'plan', caption: 'M-202', expectedVersion: 1, clientRequestId: REQUEST_ID }, PRINCIPAL)).resolves.toMatchObject({ changed: true, submittalVersion: 2, link: { id: LINK_ID, role: 'plan' } })
    expect(probe.insert).toHaveBeenCalledWith(projectSubmittalDocuments)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'project_submittal_document', action: 'create' }))
  })

  it('rejects stale links and viewers', async () => {
    const staleProbe = harness([membership, [{ version: 2, status: 'draft' }]])
    await expect(staleProbe.service.link(PROJECT_ID, SUBMITTAL_ID, { documentId: DOCUMENT_ID, role: 'plan', caption: '', expectedVersion: 1, clientRequestId: REQUEST_ID }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const deniedProbe = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(deniedProbe.service.link(PROJECT_ID, SUBMITTAL_ID, { documentId: DOCUMENT_ID, role: 'plan', caption: '', expectedVersion: 1, clientRequestId: REQUEST_ID }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('unlinks a link only with the current parent version', async () => {
    const probe = harness([membership, submittal, [{ id: LINK_ID, documentId: DOCUMENT_ID }]])
    await expect(probe.service.unlink(PROJECT_ID, SUBMITTAL_ID, LINK_ID, { expectedVersion: 1 }, PRINCIPAL)).resolves.toMatchObject({ changed: true, linkId: LINK_ID, submittalVersion: 2 })
    expect(probe.deleteFn).toHaveBeenCalledWith(projectSubmittalDocuments)
  })
})
