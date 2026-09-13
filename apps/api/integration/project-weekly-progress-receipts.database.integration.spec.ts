import 'reflect-metadata'
import { createHash, randomUUID } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import { auditLog, db, progressUpdates, projects, projectWeeklyProgress, tenants, users } from '@third-code-erp/database'
import { weeklyProgressCutoffAt, weeklyProgressCapturePayload, type ProjectWeeklyProgressCommandReceipt } from '@third-code-erp/shared-types'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { AuditService, type SemanticAuditParams } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { ProjectWeeklyProgressService } from '../src/projects/project-weekly-progress.service'

const suite = process.env.ERP_API_INTEGRATION_EXPECTED === '1' ? describe : describe.skip
const service = new ProjectWeeklyProgressService(new DatabaseService(), new AuditService())
const percentages = { civil_pct: 20, electrical_pct: 30, mep_pct: 40, finishes_pct: 50, overall_pct: 35 }
let futureWeek: string
beforeAll(async () => {
  if (process.env.ERP_API_INTEGRATION_EXPECTED !== '1') return
  if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Loopback synthetic database required')
  const [clock] = await db.execute<{ week: string }>(sql`select (clock_timestamp() at time zone 'UTC' + interval '14 days')::date::text as week`)
  futureWeek = clock!.week
})
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `weekly-receipt-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic receipt tenant', slug: `weekly-receipt-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, role: 'admin', email: principal.email, full_name: 'Synthetic actor' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic receipt project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
  })
  return { tenantId, userId, projectId, principal }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function command(f: Fixture) { return { projectId: f.projectId, clientRequestId: randomUUID(), weekEnding: futureWeek, percentByCategory: percentages, notes: 'Original capture' } }
async function state(f: Fixture) {
  return {
    periods: await db.select().from(projectWeeklyProgress).where(eq(projectWeeklyProgress.tenant_id, f.tenantId)).orderBy(asc(projectWeeklyProgress.id)),
    evidence: await db.select().from(progressUpdates).where(eq(progressUpdates.tenant_id, f.tenantId)).orderBy(asc(progressUpdates.id)),
    audits: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
async function seed(f: Fixture, week = '2020-01-05', cutoff = weeklyProgressCutoffAt(week)) {
  const id = randomUUID(), evidenceId = randomUUID(), requestId = randomUUID()
  await db.transaction(async tx => {
    await new AuditService().stampActor(tx, f.principal)
    await tx.insert(progressUpdates).values({ id: evidenceId, tenant_id: f.tenantId, project_id: f.projectId, week_ending: new Date(`${week}T00:00:00Z`), percent_by_category: percentages, notes: 'Legacy evidence', submitted_by: f.userId })
    await tx.insert(projectWeeklyProgress).values({ id, tenant_id: f.tenantId, project_id: f.projectId, progress_update_id: evidenceId, client_request_id: requestId, request_hash: 'a'.repeat(64), week_ending: week, cutoff_at: new Date(cutoff), created_by: f.userId, created_at: new Date(`${week}T00:00:00Z`), updated_at: new Date(`${week}T00:00:00Z`) })
  })
  return { id, evidenceId, requestId }
}
suite('Weekly progress durable PostgreSQL receipts', () => {
  it('denies authenticated clients inserting forged command receipts with PostgreSQL 42501', async () => {
    const f = await fixture(), input = command(f), first = await service.create(input, f.principal)
    const before = await state(f)
    const failure = await db.transaction(async tx => {
      await new AuditService().stampActor(tx, f.principal)
      await tx.execute(sql`set local role authenticated`)
      await tx.insert(auditLog).values({ tenant_id: f.tenantId, actor_id: f.userId, entity_type: 'project_weekly_progress_command', entity_id: randomUUID(), action: 'create', diff: { schemaVersion: 1, payloadHash: first.receipt!.payloadHash, receipt: first.receipt }, prev_hash: 'genesis', hash: 'a'.repeat(64) })
      throw new Error('Forged receipt unexpectedly accepted; rollback fixture')
    }).catch((error: unknown) => error)
    let cause: unknown = failure
    const seen = new Set<object>()
    let code: unknown
    while (cause && typeof cause === 'object' && !seen.has(cause)) {
      seen.add(cause)
      if ('code' in cause) code = cause.code
      cause = 'cause' in cause ? cause.cause : undefined
    }
    expect(code).toBe('42501')
    expect(await state(f)).toEqual(before)
  })

  it.each(['backwards timestamps', 'contradictory audit action'] as const)('rejects a receipt with %s', async (corruption) => {
    const f = await fixture(), input = command(f), first = await service.create(input, f.principal), badKey = randomUUID()
    const invalidReceipt = { ...first.receipt!, clientRequestId: badKey, row: { ...first.row, clientRequestId: badKey, ...(corruption === 'backwards timestamps' ? { createdAt: new Date(Date.parse(first.row.updatedAt) + 1000).toISOString() } : {}) } }
    await db.transaction(tx => new AuditService().writeSemantic(tx, { tenantId: f.tenantId, actorId: f.userId, entityType: 'project_weekly_progress_command', entityId: badKey, action: corruption === 'contradictory audit action' ? 'lock' : 'create', diff: { schemaVersion: 1, payloadHash: invalidReceipt.payloadHash, receipt: invalidReceipt } }))
    const before = await state(f)
    await expect(service.create({ ...input, clientRequestId: badKey }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('does not confuse identical request UUIDs in different tenants', async () => {
    const a = await fixture(), b = await fixture(), requestId = randomUUID()
    const first = await service.create({ ...command(a), clientRequestId: requestId }, a.principal)
    const before = await state(a)
    const second = await service.create({ ...command(b), clientRequestId: requestId }, b.principal)
    expect(second.receipt?.tenantId).toBe(b.tenantId)
    expect(second.row.id).not.toBe(first.row.id)
    expect(await state(a)).toEqual(before)
  })

  it('does not issue a fresh receipt for an already locked period', async () => {
    const f = await fixture(), period = await seed(f)
    await service.lock(f.projectId, period.id, { expectedVersion: 1, lockReason: 'Legacy no-key lock' }, f.principal)
    const before = await state(f)
    await expect(service.lock(f.projectId, period.id, { clientRequestId: randomUUID(), expectedVersion: 2, lockReason: 'Legacy no-key lock' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
    const legacyReplay = await service.lock(f.projectId, period.id, { expectedVersion: 2, lockReason: 'Legacy no-key lock' }, f.principal)
    expect(legacyReplay.changed).toBe(false)
    expect(legacyReplay.receipt).toBeUndefined()
  })

  it('settles concurrent same-key WAR locks with one durable command receipt', async () => {
    const f = await fixture(), period = await seed(f), input = { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: 'Concurrent WAR' }
    const outcomes = await Promise.allSettled([service.lock(f.projectId, period.id, input, f.principal), service.lock(f.projectId, period.id, input, f.principal)])
    expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true)
    for (const result of outcomes) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException)
    const before = await state(f)
    expect((await service.lock(f.projectId, period.id, input, f.principal)).changed).toBe(false)
    expect(await state(f)).toEqual(before)
    expect(before.audits.filter(row => row.entity_type === 'project_weekly_progress_command')).toHaveLength(1)
  })

  it('rejects a malformed original receipt without trusting a shape-valid payload hash', async () => {
    const f = await fixture(), input = command(f), first = await service.create(input, f.principal), badKey = randomUUID()
    const invalidReceipt = { ...first.receipt!, clientRequestId: badKey, row: { ...first.row, clientRequestId: badKey, version: 9 } }
    await db.transaction(tx => new AuditService().writeSemantic(tx, { tenantId: f.tenantId, actorId: f.userId, entityType: 'project_weekly_progress_command', entityId: badKey, action: 'create', diff: { schemaVersion: 1, payloadHash: invalidReceipt.payloadHash, receipt: invalidReceipt } }))
    const before = await state(f)
    await expect(service.create({ ...input, clientRequestId: badKey }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('uses PostgreSQL wall time for capture and rejects an expired period', async () => {
    const f = await fixture()
    const [start] = await db.execute<{ time: string }>(sql`select clock_timestamp()::text as time`)
    const created = await service.create(command(f), f.principal)
    const [end] = await db.execute<{ time: string }>(sql`select clock_timestamp()::text as time`)
    expect(Date.parse(created.row.createdAt)).toBeGreaterThanOrEqual(Date.parse(start!.time))
    expect(Date.parse(created.row.createdAt)).toBeLessThanOrEqual(Date.parse(end!.time))
    const before = await state(f)
    await expect(service.create({ ...command(f), weekEnding: '2020-01-05' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('rejects early WAR lock against the actual database clock', async () => {
    const f = await fixture(), created = await service.create(command(f), f.principal)
    const before = await state(f)
    await expect(service.lock(f.projectId, created.row.id, { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: '' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it.each(['actor', 'project', 'payload', 'operation'] as const)('rejects a capture key reused with different %s and preserves both scopes', async (difference) => {
    const f = await fixture(), input = command(f)
    await service.create(input, f.principal)
    const otherProject = randomUUID(), otherActor = randomUUID()
    await db.transaction(async tx => {
      await tx.insert(users).values({ id: otherActor, tenant_id: f.tenantId, role: 'admin', email: `other-${otherActor}@integration.test`, full_name: 'Other actor' })
      await tx.insert(projects).values({ id: otherProject, tenant_id: f.tenantId, name: 'Other project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: f.userId })
    })
    const before = await state(f)
    const attempt = difference === 'operation'
      ? service.lock(f.projectId, before.periods[0]!.id, { clientRequestId: input.clientRequestId, expectedVersion: 1, lockReason: '' }, f.principal)
      : service.create({ ...input, ...(difference === 'project' ? { projectId: otherProject } : {}), ...(difference === 'payload' ? { notes: 'Different payload' } : {}) }, difference === 'actor' ? { ...f.principal, userId: otherActor } : f.principal)
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it.each(['actor', 'payload', 'period'] as const)('rejects a lock key reused with different %s', async (difference) => {
    const f = await fixture(), period = await seed(f), request = { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: 'WAR' }
    await service.lock(f.projectId, period.id, request, f.principal)
    const actorId = randomUUID()
    await db.insert(users).values({ id: actorId, tenant_id: f.tenantId, role: 'admin', email: `lock-other-${actorId}@integration.test`, full_name: 'Other actor' })
    const before = await state(f)
    await expect(service.lock(f.projectId, difference === 'period' ? randomUUID() : period.id, { ...request, ...(difference === 'payload' ? { lockReason: 'Different' } : {}) }, difference === 'actor' ? { ...f.principal, userId: actorId } : f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('canonicalizes UUID casing and trimmed notes without changing command identity', async () => {
    const f = await fixture(), input = command(f)
    const first = await service.create(input, f.principal)
    const before = await state(f)
    const replay = await service.create({ ...input, projectId: input.projectId.toUpperCase(), clientRequestId: input.clientRequestId.toUpperCase(), notes: ` ${input.notes} ` }, { ...f.principal, userId: f.userId.toUpperCase(), tenantId: f.tenantId.toUpperCase() })
    expect(replay.receipt).toEqual(first.receipt)
    expect(replay.changed).toBe(false)
    expect(await state(f)).toEqual(before)
  })

  it.each(['current', 'overwritten'] as const)('recognizes a %s legacy key without fabricating a receipt or writing', async (kind) => {
    const f = await fixture(), period = await seed(f, futureWeek)
    if (kind === 'overwritten') await db.update(projectWeeklyProgress).set({ client_request_id: randomUUID(), request_hash: 'b'.repeat(64) }).where(eq(projectWeeklyProgress.id, period.id))
    const before = await state(f)
    await expect(service.create({ ...command(f), clientRequestId: period.requestId }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('recognizes an intermediate legacy key from UPDATE after/before audit evidence', async () => {
    const f = await fixture(), period = await seed(f, futureWeek), intermediateKey = randomUUID()
    await db.update(projectWeeklyProgress).set({ client_request_id: intermediateKey }).where(eq(projectWeeklyProgress.id, period.id))
    await db.update(projectWeeklyProgress).set({ client_request_id: randomUUID() }).where(eq(projectWeeklyProgress.id, period.id))
    const before = await state(f)
    await expect(service.create({ ...command(f), clientRequestId: intermediateKey }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it.each(['capture', 'lock'] as const)('rolls back %s and all audits when receipt persistence fails after insert', async (operation) => {
    class FailingAudit extends AuditService {
      override async writeSemantic(tx: DatabaseTransaction, params: SemanticAuditParams): Promise<void> {
        await super.writeSemantic(tx, params)
        if (params.entityType === 'project_weekly_progress_command') throw new Error('Synthetic receipt failure')
      }
    }
    const f = await fixture(), failing = new ProjectWeeklyProgressService(new DatabaseService(), new FailingAudit())
    const period = operation === 'lock' ? await seed(f) : undefined
    const before = await state(f)
    const attempt = period ? failing.lock(f.projectId, period.id, { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: '' }, f.principal) : failing.create(command(f), f.principal)
    await expect(attempt).rejects.toThrow('Synthetic receipt failure')
    expect(await state(f)).toEqual(before)
  })

  it('settles concurrent same-key capture with exactly one receipt and evidence row', async () => {
    const f = await fixture(), input = command(f)
    const outcomes = await Promise.allSettled([service.create(input, f.principal), service.create(input, f.principal)])
    expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true)
    for (const result of outcomes) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException)
    const retry = await service.create(input, f.principal), saved = await state(f)
    expect(retry.changed).toBe(false)
    expect(saved.evidence).toHaveLength(1)
    expect(saved.audits.filter(row => row.entity_type === 'project_weekly_progress_command')).toHaveLength(1)
  })

  it('rejects evidence whose week disagrees with the period', async () => {
    const f = await fixture(), period = await seed(f)
    await db.update(progressUpdates).set({ week_ending: new Date('2020-01-12T00:00:00Z') }).where(eq(progressUpdates.id, period.evidenceId))
    const before = await state(f)
    await expect(service.lock(f.projectId, period.id, { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: '' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })

  it('replays an original historical capture receipt after WAR locking without touching the WAR', async () => {
    const f = await fixture(), period = await seed(f)
    const input = { ...command(f), clientRequestId: period.requestId, weekEnding: '2020-01-05', notes: 'Legacy evidence' }
    const original = (await service.list(f.projectId, { page: 1, limit: 25 }, f.principal)).rows[0]!
    const payloadHash = createHash('sha256').update(weeklyProgressCapturePayload(input)).digest('hex')
    const receipt: ProjectWeeklyProgressCommandReceipt = { schemaVersion: 1, tenantId: f.tenantId, actorId: f.userId, projectId: f.projectId, clientRequestId: input.clientRequestId, operation: 'capture', created: true, payloadHash, row: original }
    // Seed a past successful command receipt; never override the production clock.
    await db.transaction(tx => new AuditService().writeSemantic(tx, { tenantId: f.tenantId, actorId: f.userId, entityType: 'project_weekly_progress_command', entityId: input.clientRequestId, action: 'create', diff: { schemaVersion: 1, payloadHash, receipt } }))
    await service.lock(f.projectId, period.id, { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: 'WAR' }, f.principal)
    const before = await state(f)
    const replay = await service.create(input, f.principal)
    expect(replay).toMatchObject({ created: false, changed: false, row: original, receipt })
    expect(await state(f)).toEqual(before)
  })
  it('replays A after B with original evidence and no new writes', async () => {
    const f = await fixture(), a = command(f)
    const first = await service.create(a, f.principal)
    expect(first.receipt).toMatchObject({ operation: 'capture', actorId: f.userId, clientRequestId: a.clientRequestId, row: first.row })
    await service.create({ ...a, clientRequestId: randomUUID(), notes: 'Capture B' }, f.principal)
    const before = await state(f)
    const retry = await service.create(a, f.principal)
    expect(retry).toEqual({ ...first, created: false, changed: false })
    expect(await state(f)).toEqual(before)
  })
  it('replays keyed WAR lock with its original expected version', async () => {
    const f = await fixture(), period = await seed(f)
    const command = { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: 'WAR lock' }
    const first = await service.lock(f.projectId, period.id, command, f.principal)
    expect(first.receipt).toMatchObject({ operation: 'lock', expectedVersion: 1, row: first.row })
    const before = await state(f)
    expect(await service.lock(f.projectId, period.id, command, f.principal)).toEqual({ ...first, changed: false })
    expect(await state(f)).toEqual(before)
  })
  it('rejects a noncanonical persisted cutoff rather than locking it', async () => {
    const f = await fixture(), period = await seed(f, '2020-01-05', '2020-01-06T00:00:00Z')
    const before = await state(f)
    await expect(service.lock(f.projectId, period.id, { clientRequestId: randomUUID(), expectedVersion: 1, lockReason: '' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await state(f)).toEqual(before)
  })
})
