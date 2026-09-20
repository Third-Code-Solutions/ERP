import 'reflect-metadata'

import { createHash, randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { auditLog, db, documents, projects, punchlistItems, qualityHoldPointPunchlistHandoffs, qualityHoldPoints, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { qualityHoldPointPunchlistHandoffCommandSchema } from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { QualityHoldPointsService } from '../src/projects/quality-hold-points.service'
import { ProjectSubmittalDocumentsService } from '../src/projects/project-submittal-documents.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('Quality proof requires explicit loopback DATABASE_URL')
})
const database = new DatabaseService()
const audit = new AuditService()
const service = new QualityHoldPointsService(database, audit)
const listing = new ProjectSubmittalDocumentsService(database, audit)

// All fixtures are synthetic, committed and retained with their immutable audit history.
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID(), entryId = randomUUID(), documentId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'pm', email: `quality-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic quality tenant', slug: `quality-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic PM', role: 'pm' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic quality project', client: 'Synthetic', project_type: 'mep', created_by: userId })
    await tx.insert(documents).values({ id: documentId, tenant_id: tenantId, project_id: projectId, uploaded_by: userId, document_type: 'other', file_name: 'Synthetic plan.pdf', storage_path: `synthetic/${documentId}`, mime_type: 'application/pdf', size_bytes: 123 })
    await tx.insert(qualityHoldPoints).values({ id: entryId, tenant_id: tenantId, project_id: projectId, iwr_number: 'IWR-SYNTHETIC', title: 'Synthetic inspection', description: 'Synthetic defect', requested_by: userId, status: 'rejected', submitted_at: new Date(), submitted_by: userId, rejected_at: new Date(), rejected_by: userId, findings: 'Synthetic findings', rejection_reason: 'Synthetic correction required', client_request_id: randomUUID() })
  })
  const command = qualityHoldPointPunchlistHandoffCommandSchema.parse({ clientRequestId: randomUUID(), planDocumentId: documentId, items: [{ description: 'Repair synthetic defect' }] })
  return { tenantId, userId, projectId, entryId, documentId, principal, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    source: await db.select().from(qualityHoldPoints).where(eq(qualityHoldPoints.id, f.entryId)),
    handoffs: await db.select().from(qualityHoldPointPunchlistHandoffs).where(eq(qualityHoldPointPunchlistHandoffs.tenant_id, f.tenantId)),
    items: await db.select().from(punchlistItems).where(eq(punchlistItems.tenant_id, f.tenantId)),
    audits: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
const handoff = (f: Fixture) => service.handoffToPunchlist(f.projectId, f.entryId, f.command, f.principal)

suite('Quality document handoff PostgreSQL boundaries', () => {
  it('replays the exact uppercase UUID command without changing its persisted hash', async () => {
    const f = await fixture()
    const command = { ...f.command, clientRequestId: 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF', planDocumentId: f.documentId.toUpperCase() }
    const first = await service.handoffToPunchlist(f.projectId.toUpperCase(), f.entryId.toUpperCase(), command, f.principal)
    const before = await snapshot(f)
    expect(before.handoffs[0]?.request_hash).toBe(createHash('sha256').update(JSON.stringify(command)).digest('hex'))
    const replay = await service.handoffToPunchlist(f.projectId.toUpperCase(), f.entryId.toUpperCase(), command, f.principal)
    expect(first.created).toBe(true)
    expect(replay).toMatchObject({ created: false, clientRequestId: command.clientRequestId.toLowerCase(), handoffId: first.handoffId })
    expect(await snapshot(f)).toEqual(before)
  })
  it('commits and concurrently replays one request with its stored receipt identity', async () => {
    const f = await fixture()
    const results = await Promise.all([handoff(f), handoff(f)])
    expect(results.map(result => result.created).sort()).toEqual([false, true])
    for (const result of results) expect(result).toMatchObject({ clientRequestId: f.command.clientRequestId, projectId: f.projectId, qualityHoldPointId: f.entryId, source: { planDocumentId: f.documentId } })
    const state = await snapshot(f)
    expect(state.handoffs).toHaveLength(1)
    expect(state.items).toHaveLength(1)
    expect(state.audits.filter(row => row.entity_type === 'quality_hold_point_punchlist_handoff')).toHaveLength(1)
    await handoff(f)
    expect(await snapshot(f)).toEqual(state)
  })

  it.each(['invited', 'suspended', 'disabled'] as const)('denies a stale principal for a %s actor on both paths', async account_status => {
    const f = await fixture()
    await db.update(users).set({ account_status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, f.userId))
    const before = await snapshot(f)
    await expect(handoff(f)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(listing.listProjectDocuments(f.projectId, { page: 1, limit: 10 }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })

  it.each(['suspended', 'disabled'] as const)('denies a stale principal for a %s tenant on both paths', async status => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    const before = await snapshot(f)
    await expect(handoff(f)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(listing.listProjectDocuments(f.projectId, { page: 1, limit: 10 }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('checks current capability and leaves the all-role document-read policy intact', async () => {
    const f = await fixture()
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    const before = await snapshot(f)
    await expect(handoff(f)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await listing.listProjectDocuments(f.projectId, { page: 1, limit: 10 }, f.principal)).toMatchObject({ total: 1, rows: [{ id: f.documentId }] })
    expect(await snapshot(f)).toEqual(before)
  })

  it.each(['actor', 'tenant'] as const)('rejects held %s authority locks without durable changes', async target => {
    const f = await fixture()
    const before = await snapshot(f)
    await db.transaction(async holder => {
      if (target === 'actor') await holder.select().from(users).where(eq(users.id, f.userId)).for('update')
      else await holder.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
      await expect(handoff(f)).rejects.toBeInstanceOf(ConflictException)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('holds actor and tenant admission locks through semantic audit', async () => {
    const f = await fixture()
    const observed: string[] = []
    const checkedAudit = new AuditService()
    const write = checkedAudit.writeSemantic.bind(checkedAudit)
    vi.spyOn(checkedAudit, 'writeSemantic').mockImplementation(async (tx, params) => {
      await write(tx, params)
      for (const target of ['actor', 'tenant']) {
        try {
          await db.transaction(async probe => {
            if (target === 'actor') await probe.select().from(users).where(eq(users.id, f.userId)).for('update', { noWait: true })
            else await probe.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })
          })
          throw new Error(`Missing ${target} admission lock`)
        } catch (error) {
          expect(databaseCode(error)).toBe('55P03')
          observed.push(target)
        }
      }
    })
    await new QualityHoldPointsService(database, checkedAudit).handoffToPunchlist(f.projectId, f.entryId, f.command, f.principal)
    expect(observed).toEqual(['actor', 'tenant'])
    expect((await snapshot(f)).handoffs).toHaveLength(1)
  })

  it('rejects changed payload and changed document under the accepted key without new effects', async () => {
    const f = await fixture()
    await handoff(f)
    const before = await snapshot(f)
    await expect(service.handoffToPunchlist(f.projectId, f.entryId, { ...f.command, items: [{ ...f.command.items[0]!, description: 'Different correction' }] }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    await expect(service.handoffToPunchlist(f.projectId, f.entryId, { ...f.command, planDocumentId: null }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rejects foreign tenant/project documents, project and source without writes', async () => {
    const f = await fixture(), foreign = await fixture()
    const otherProjectId = randomUUID(), otherDocumentId = randomUUID()
    await db.insert(projects).values({ id: otherProjectId, tenant_id: f.tenantId, name: 'Other synthetic project', client: 'Synthetic', project_type: 'mep', created_by: f.userId })
    await db.insert(documents).values({ id: otherDocumentId, tenant_id: f.tenantId, project_id: otherProjectId, document_type: 'other', file_name: 'Other plan.pdf', storage_path: `synthetic/${otherDocumentId}`, mime_type: 'application/pdf', size_bytes: 1 })
    const before = await snapshot(f)
    for (const planDocumentId of [foreign.documentId, otherDocumentId]) {
      await expect(service.handoffToPunchlist(f.projectId, f.entryId, { ...f.command, planDocumentId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    }
    await expect(service.handoffToPunchlist(foreign.projectId, foreign.entryId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.handoffToPunchlist(f.projectId, foreign.entryId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(listing.listProjectDocuments(foreign.projectId, { page: 1, limit: 10 }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect((await listing.listProjectDocuments(f.projectId, { page: 1, limit: 10 }, f.principal)).rows.map(row => row.id)).toEqual([f.documentId])
    expect(await snapshot(f)).toEqual(before)
  })

  it('rolls back handoff, items, source marker and actual audit insert when audit completion fails', async () => {
    const f = await fixture(), failedAudit = new AuditService()
    const before = await snapshot(f)
    const failure = new Error('Synthetic post-audit failure')
    const write = failedAudit.writeSemantic.bind(failedAudit)
    vi.spyOn(failedAudit, 'writeSemantic').mockImplementation(async (tx, params) => { await write(tx, params); throw failure })
    await expect(new QualityHoldPointsService(database, failedAudit).handoffToPunchlist(f.projectId, f.entryId, f.command, f.principal)).rejects.toBe(failure)
    expect(await snapshot(f)).toEqual(before)
    expect((await handoff(f)).created).toBe(true)
  })

  it('paginates document metadata without duplicates and does not leak storage paths', async () => {
    const f = await fixture()
    await db.insert(documents).values(Array.from({ length: 12 }, (_, index) => ({ tenant_id: f.tenantId, project_id: f.projectId, document_type: 'other' as const, file_name: `Synthetic ${index}.pdf`, storage_path: `synthetic/${randomUUID()}`, mime_type: 'application/pdf', size_bytes: index, created_at: new Date('2026-09-01T00:00:00Z') })))
    const before = await snapshot(f)
    const first = await listing.listProjectDocuments(f.projectId, { page: 1, limit: 10 }, f.principal)
    const second = await listing.listProjectDocuments(f.projectId, { page: 2, limit: 10 }, f.principal)
    expect(first).toMatchObject({ total: 13, totalPages: 2 })
    expect(first.rows).toHaveLength(10)
    expect(second.rows).toHaveLength(3)
    expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(13)
    for (const row of [...first.rows, ...second.rows]) expect(row).not.toHaveProperty('storagePath')
    expect((await listing.listProjectDocuments(f.projectId, { page: 3, limit: 10 }, f.principal)).rows).toEqual([])
    expect(await snapshot(f)).toEqual(before)
  })
})

function databaseCode(error: unknown): unknown {
  const visited = new Set<unknown>()
  while (error instanceof Object && !visited.has(error)) {
    visited.add(error)
    if ('code' in error) return error.code
    error = 'cause' in error ? error.cause : undefined
  }
  return undefined
}
