import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { accounts, auditLog, db, documents, opportunities, projects, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { InspectionPhotoService } from '../src/documents/inspection-photo.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = enabled ? describe : describe.skip
beforeAll(() => {
  if (!enabled) return
  const url = process.env.DATABASE_URL
  if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Photo admission proof requires explicit loopback DATABASE_URL')
})
const database = new DatabaseService()
const service = new InspectionPhotoService(database, new AuditService())

// Synthetic committed metadata fixtures and their audit history are retained. No Storage calls.
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), opportunityId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'commercial', email: `photo-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic photo tenant', slug: `photo-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic commercial', email: principal.email, role: 'commercial' })
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Synthetic photo account', industry: 'office', kyc_status: 'approved', created_by: userId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, rep_id: userId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
  })
  const command = { opportunityId, storagePath: `${tenantId}/opportunities/${opportunityId}/inspection/Synthetic.JPG`, fileName: 'Synthetic.JPG', mimeType: 'image/jpeg' as const, sizeBytes: 123, caption: null }
  return { tenantId, userId, opportunityId, principal, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    documents: await db.select().from(documents).where(eq(documents.tenant_id, f.tenantId)).orderBy(asc(documents.id)),
    audits: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}

suite('Inspection photo fresh admission and exact metadata replay', () => {
  it('concurrently registers once, replays caption fallback and preserves same-tenant dedup after project conversion', async () => {
    const f = await fixture()
    const [first, second] = await Promise.all([service.create(f.command, f.principal), service.create(f.command, f.principal)])
    expect(second).toEqual(first)
    let state = await snapshot(f)
    expect(state.documents).toHaveLength(1)
    expect(state.documents[0]?.description).toBe('WO-12 site inspection photo')
    expect(state.documents[0]?.storage_path).toBe(f.command.storagePath)
    expect(state.audits.filter(row => row.entity_type === 'document' && typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'site_inspection_photo_core_authority')).toHaveLength(1)
    const projectId = randomUUID(), colleagueId = randomUUID()
    await db.insert(projects).values({ id: projectId, tenant_id: f.tenantId, name: 'Synthetic converted project', client: 'Synthetic', project_type: 'mep', created_by: f.userId })
    await db.update(opportunities).set({ project_id: projectId }).where(eq(opportunities.id, f.opportunityId))
    await db.insert(users).values({ id: colleagueId, tenant_id: f.tenantId, full_name: 'Synthetic colleague', email: `${colleagueId}@integration.test`, role: 'commercial' })
    state = await snapshot(f)
    expect(await service.create({ ...f.command, caption: '' }, { ...f.principal, userId: colleagueId })).toEqual(first)
    expect(await snapshot(f)).toEqual(state)
  })

  it('rejects a matching path belonging to a non-image document', async () => {
    const f = await fixture()
    await db.insert(documents).values({ tenant_id: f.tenantId, opportunity_id: f.opportunityId, document_type: 'other', file_name: f.command.fileName, storage_path: f.command.storagePath, mime_type: f.command.mimeType, size_bytes: f.command.sizeBytes, description: 'WO-12 site inspection photo' })
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rejects stale roles, foreign opportunities and out-of-scope paths without writes', async () => {
    const f = await fixture(), foreign = await fixture()
    const before = await snapshot(f)
    await expect(service.create({ ...f.command, opportunityId: foreign.opportunityId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create({ ...f.command, storagePath: foreign.command.storagePath }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    const demoted = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(demoted)
  })

  it.each(['actor', 'tenant'] as const)('rejects held %s authority locks and rolls back', async target => {
    const f = await fixture(), before = await snapshot(f)
    await db.transaction(async holder => {
      if (target === 'actor') await holder.select().from(users).where(eq(users.id, f.userId)).for('update')
      else await holder.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
      await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('holds authority through actual audit insertion and rolls back all evidence on audit completion failure', async () => {
    const f = await fixture(), before = await snapshot(f), audit = new AuditService()
    const write = audit.writeSemantic.bind(audit), failure = new Error('Synthetic post-audit failure')
    const locked: string[] = []
    vi.spyOn(audit, 'writeSemantic').mockImplementation(async (tx, params) => {
      await write(tx, params)
      for (const target of ['actor', 'tenant']) {
        await expect(db.transaction(async probe => {
          if (target === 'actor') await probe.select().from(users).where(eq(users.id, f.userId)).for('update', { noWait: true })
          else await probe.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })
        }).catch((error: unknown) => { expect(pgCode(error)).toBe('55P03'); locked.push(target); throw error })).rejects.toBeDefined()
      }
      throw failure
    })
    await expect(new InspectionPhotoService(database, audit).create(f.command, f.principal)).rejects.toBe(failure)
    expect(locked).toEqual(['actor', 'tenant'])
    expect(await snapshot(f)).toEqual(before)
    expect((await service.create(f.command, f.principal)).status).toBe('created')
  })
  it.each(['invited', 'suspended', 'disabled'] as const)('denies freshly %s actors with stale principals', async account_status => {
    const f = await fixture()
    await db.update(users).set({ account_status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, f.userId))
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['suspended', 'disabled'] as const)('denies freshly %s tenants', async status => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })
  it.each([{ fileName: 'changed.jpg' }, { mimeType: 'image/png' as const }, { sizeBytes: 124 }, { caption: 'Changed caption' }])('rejects changed metadata %j without additional effects', async change => {
    const f = await fixture()
    await service.create(f.command, f.principal)
    const before = await snapshot(f)
    await expect(service.create({ ...f.command, ...change }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })
})

function pgCode(error: unknown): unknown {
  const seen = new Set<unknown>()
  while (error instanceof Object && !seen.has(error)) {
    seen.add(error)
    if ('code' in error) return error.code
    error = 'cause' in error ? error.cause : undefined
  }
  return undefined
}
