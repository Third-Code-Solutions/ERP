import 'reflect-metadata'

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { ClaimDocumentService } from './claim-document.service'
import { ClaimDocumentPipe } from './claim-document.pipe'

const principal: ErpPrincipal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'admin', email: 'claim@example.test' }
const claimId = '33333333-3333-4333-8333-333333333333'
const projectId = '44444444-4444-4444-8444-444444444444'
const command = { clientRequestId: '55555555-5555-4555-8555-555555555555', documentId: '66666666-6666-4666-8666-666666666666', kind: 'photo' as const, caption: 'Evidence' }
const existing: { id: string; claim_id: string; document_id: string; kind: string; caption: string; uploaded_by: string } = { id: command.clientRequestId, claim_id: claimId, document_id: command.documentId, kind: command.kind, caption: command.caption, uploaded_by: principal.userId }

function harness(options: { role?: string; accountStatus?: string; tenantStatus?: string; status?: string; claim?: boolean; project?: boolean; document?: boolean; existing?: typeof existing; collision?: boolean } = {}) {
  const responses = [
    [{ tenantId: principal.tenantId, role: options.role ?? 'admin', email: principal.email, accountStatus: options.accountStatus ?? 'active', tenantStatus: options.tenantStatus ?? 'active' }],
    options.claim === false ? [] : [{ id: claimId, projectId, status: options.status ?? 'draft' }],
    options.existing ? [options.existing] : [],
    options.project === false ? [] : [{ id: projectId }],
    options.document === false ? [] : [{ id: command.documentId }],
  ]
  const select = vi.fn(() => {
    const rows = responses.shift() ?? []
    const query = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn(), for: vi.fn() }
    query.from.mockReturnValue(query)
    query.innerJoin.mockReturnValue(query)
    query.where.mockReturnValue(query)
    query.limit.mockReturnValue(Object.assign(Promise.resolve(rows), { for: query.for }))
    query.for.mockResolvedValue(rows)
    return query
  })
  const returning = vi.fn().mockResolvedValue(options.collision ? [] : [{ id: command.clientRequestId }])
  const values = vi.fn().mockReturnValue({ onConflictDoNothing: () => ({ returning }) })
  const insert = vi.fn().mockReturnValue({ values })
  const transactionClient = { select, insert }
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn(), tryLockTenantChain: vi.fn().mockResolvedValue(true) }
  // Deliberately partial database/audit doubles; real transaction rollback and locks are proved in PostgreSQL integration.
  const service = new ClaimDocumentService({ client: { transaction: async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient) } } as unknown as DatabaseService, audit as unknown as AuditService)
  return { service, insert, values, audit }
}

describe('Claim document command', () => {
  it('returns a deliberate same-request retry conflict before writing when the audit chain is busy', async () => {
    const probe = harness()
    probe.audit.tryLockTenantChain.mockResolvedValue(false)
    await expect(probe.service.attach(claimId, command, principal)).rejects.toThrow('Another update is in progress. Retry with the same request ID.')
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })
  it('rejects unknown authority fields and malformed inputs', () => {
    const pipe = new ClaimDocumentPipe()
    for (const input of [{ ...command, tenantId: principal.tenantId }, { ...command, documentId: 'invalid' }, { ...command, kind: 'invoice' }, { ...command, caption: 'a'.repeat(256) }]) {
      expect(() => pipe.transform(input)).toThrow()
    }
    expect(pipe.transform({ ...command, caption: '  ' }).caption).toBeNull()
  })

  it('creates one scoped attachment and semantic audit using the request identity', async () => {
    const probe = harness()
    await expect(probe.service.attach(claimId, command, principal)).resolves.toEqual({ attachmentId: command.clientRequestId, tenantId: principal.tenantId, projectId, claimId, documentId: command.documentId, changed: true })
    expect(probe.values).toHaveBeenCalledWith(expect.objectContaining({ id: command.clientRequestId, tenant_id: principal.tenantId, claim_id: claimId, document_id: command.documentId, uploaded_by: principal.userId }))
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(1)
  })

  it('rechecks the stored role before writing', async () => {
    const probe = harness({ role: 'viewer' })
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it.each([{ accountStatus: 'suspended' }, { tenantStatus: 'suspended' }])('rejects inactive membership %j even with a previously valid principal', async (state) => {
    const probe = harness(state)
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it.each(['paid', 'rejected', 'cancelled'])('rejects new evidence in terminal status %s', async (status) => {
    const probe = harness({ status })
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(ConflictException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it.each(['claim', 'project', 'document'] as const)('rejects absent or out-of-scope %s', async (field) => {
    const probe = harness({ [field]: false })
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('replays an identical committed request even after the claim is paid', async () => {
    const probe = harness({ status: 'paid', existing })
    probe.audit.tryLockTenantChain.mockResolvedValue(false)
    await expect(probe.service.attach(claimId, command, principal)).resolves.toMatchObject({ changed: false, attachmentId: command.clientRequestId })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(probe.audit.tryLockTenantChain).not.toHaveBeenCalled()
  })

  it.each([{ caption: 'Changed' }, { document_id: projectId }, { claim_id: projectId }, { kind: 'other' }, { uploaded_by: projectId }])('rejects a replay with different persisted payload %j', async (change) => {
    const probe = harness({ existing: { ...existing, ...change } })
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(ConflictException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('returns a generic conflict for a globally occupied request UUID', async () => {
    const probe = harness({ collision: true })
    await expect(probe.service.attach(claimId, command, principal)).rejects.toBeInstanceOf(ConflictException)
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })
})
