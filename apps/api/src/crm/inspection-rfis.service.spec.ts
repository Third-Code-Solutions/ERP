import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InspectionRfisService } from './inspection-rfis.service'

const tenantId = '22222222-2222-4222-8222-222222222222'
const opportunityId = '33333333-3333-4333-8333-333333333333'
const rfiId = '44444444-4444-4444-8444-444444444444'
const principal = { tenantId, userId: '11111111-1111-4111-8111-111111111111', role: 'commercial' as const, email: 'commercial@example.test' }
const row = { id: rfiId, inspectionId: '55555555-5555-4555-8555-555555555555', inspectionStatus: 'submitted', description: 'Confirm ceiling clearance', priority: 'major', createdAt: new Date('2026-09-10T00:00:00Z'), resolvedAt: null as Date | null, resolvedBy: null as string | null }

function harness(results: unknown[][]) {
  const predicates: SQL[] = []
  const locks: string[] = []
  const orderBy = vi.fn()
  const select = vi.fn().mockImplementation(() => {
    const result = results.shift() ?? []
    const chain = {
      from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn((predicate: SQL) => { predicates.push(predicate); return chain }),
      limit: vi.fn().mockReturnThis(), offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn((...args: unknown[]) => { orderBy(...args); return chain }),
      for: vi.fn((lock: string) => { locks.push(lock); return chain }),
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
    }
    return chain
  })
  const returning = vi.fn().mockResolvedValue([{ id: rfiId }])
  const updateWhere = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })
  const transaction = { select, update }
  const run = vi.fn(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction))
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  // Narrow test double exposes only the Drizzle methods exercised by this service.
  const service = new InspectionRfisService({ client: { select, transaction: run } } as unknown as DatabaseService, audit as unknown as AuditService)
  return { service, audit, update, set, predicates, locks, returning, orderBy, run }
}

describe('InspectionRfisService', () => {
  it('lists across inspections with tenant/opportunity filters, stable order and pagination', async () => {
    const probe = harness([[{ id: opportunityId }], [row], [{ total: 27 }]])
    const result = await probe.service.list(opportunityId, { page: 2, limit: 25, status: 'open', priority: 'major' }, principal)
    expect(result).toMatchObject({ total: 27, totalPages: 2, page: 2, rows: [{ id: rfiId, resolvedAt: null }] })
    const queries = probe.predicates.map((predicate) => new PgDialect().sqlToQuery(predicate))
    expect(queries[0]?.params).toContain(tenantId)
    for (const query of queries.slice(1)) {
      expect(query.params.filter((value) => value === tenantId)).toHaveLength(2)
      expect(query.params).toContain(opportunityId)
      expect(query.sql).toContain('"resolved_at" is null')
      expect(query.params).toContain('major')
    }
    expect(probe.orderBy).toHaveBeenCalledOnce()
  })

  it('hides missing or foreign opportunities from the list', async () => {
    await expect(harness([[]]).service.list(opportunityId, { page: 1, limit: 25 }, principal)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('resolves under ownership locks and atomically records the actor/reason', async () => {
    const probe = harness([[{ role: 'commercial' }], [{ id: opportunityId }], [row]])
    const result = await probe.service.transition(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: '  Engineer confirmed  ' }, principal)
    expect(result.changed).toBe(true)
    expect(result.rfi.resolvedBy).toBe(principal.userId)
    expect(result.rfi.resolvedAt).not.toBeNull()
    expect(probe.locks).toEqual(['share', 'share', 'update'])
    expect(probe.audit.stampActor).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId, actorId: principal.userId, entityId: rfiId, diff: expect.objectContaining({ reason: 'Engineer confirmed', from: 'open', to: 'resolved' }) }))
    const predicate = new PgDialect().sqlToQuery(probe.predicates[2]!)
    expect(predicate.params.filter((value) => value === tenantId)).toHaveLength(2)
    expect(predicate.params).toContain(opportunityId)
    expect(predicate.params).toContain(rfiId)
  })

  it('reopens and clears both resolution fields', async () => {
    const resolvedAt = new Date('2026-09-10T01:00:00Z')
    const probe = harness([[{ role: 'admin' }], [{ id: opportunityId }], [{ ...row, resolvedAt, resolvedBy: principal.userId }]])
    const result = await probe.service.transition(opportunityId, rfiId, 'open', { expectedResolvedAt: resolvedAt.toISOString(), reason: 'Clearance changed' }, principal)
    expect(result.rfi).toMatchObject({ resolvedAt: null, resolvedBy: null })
    expect(probe.set).toHaveBeenCalledWith({ resolved_at: null, resolved_by: null })
  })

  it('rejects stale state even when target is already current', async () => {
    const probe = harness([[{ role: 'commercial' }], [{ id: opportunityId }], [{ ...row, resolvedAt: new Date() }]])
    await expect(probe.service.transition(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: 'Done' }, principal)).rejects.toBeInstanceOf(ConflictException)
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('returns unchanged for matching current state without a duplicate semantic audit', async () => {
    const probe = harness([[{ role: 'commercial' }], [{ id: opportunityId }], [row]])
    expect((await probe.service.transition(opportunityId, rfiId, 'open', { expectedResolvedAt: null, reason: 'Already open' }, principal)).changed).toBe(false)
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects revoked membership before writing', async () => {
    const probe = harness([[{ role: 'viewer' }]])
    await expect(probe.service.transition(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: 'Done' }, principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.update).not.toHaveBeenCalled()
  })

  it.each([{ results: [[{ role: 'commercial' }], []] }, { results: [[{ role: 'commercial' }], [{ id: opportunityId }], []] }])('rejects foreign/missing ownership without writes', async ({ results }) => {
    const probe = harness(results)
    await expect(probe.service.transition(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: 'Done' }, principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.update).not.toHaveBeenCalled()
  })

  it('propagates audit failure through the transaction instead of reporting success', async () => {
    const probe = harness([[{ role: 'commercial' }], [{ id: opportunityId }], [row]])
    probe.audit.writeSemantic.mockRejectedValue(new Error('audit unavailable'))
    await expect(probe.service.transition(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: 'Done' }, principal)).rejects.toThrow('audit unavailable')
    expect(probe.run).toHaveBeenCalledOnce()
  })
})
