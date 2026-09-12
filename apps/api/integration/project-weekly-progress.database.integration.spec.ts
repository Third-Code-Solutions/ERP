import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { NotFoundException } from '@nestjs/common'
import { auditLog, db, progressUpdates, projects, projectWeeklyProgress, tenants, users } from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { ProjectWeeklyProgressService } from '../src/projects/project-weekly-progress.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const service = new ProjectWeeklyProgressService(new DatabaseService(), new AuditService())
const weekEnding = '2020-01-05'
const cutoff = new Date('2020-01-09T09:00:00.000Z')
const captureTime = new Date('2020-01-08T09:00:00.000Z')
const lockTime = new Date('2020-01-09T10:00:00.000Z')
const percentages = { civil_pct: 20, electrical_pct: 30, mep_pct: 40, finishes_pct: 50, overall_pct: 35 }

beforeAll(async () => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Weekly progress proof requires an explicit loopback disposable DATABASE_URL')
  }
  const [clock] = await db.execute<{ ready: boolean }>(sql`select now() > ${lockTime.toISOString()}::timestamptz as ready`)
  expect(clock?.ready).toBe(true)
})

// UUID-isolated synthetic fixtures commit and retain all immutable audit history.
// Historical service timestamps exercise both sides of cutoff without modifying
// the actual DB clock: the lock trigger independently checks PostgreSQL now().
async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `weekly-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic weekly tenant', slug: `weekly-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic weekly admin', role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic weekly project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
  })
  return { tenantId, userId, projectId, principal }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function command(f: Fixture) {
  return { projectId: f.projectId, clientRequestId: randomUUID(), weekEnding, percentByCategory: percentages, notes: 'Synthetic weekly capture' }
}

// Seed an open period directly so update and lock independently reproduce their
// write-result mapping bugs even while service create is failing.
async function seedPeriod(f: Fixture) {
  const progressId = randomUUID()
  const periodId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(progressUpdates).values({ id: progressId, tenant_id: f.tenantId, project_id: f.projectId, week_ending: new Date(`${weekEnding}T00:00:00.000Z`), percent_by_category: percentages, notes: 'Original evidence', submitted_by: f.userId })
    await tx.insert(projectWeeklyProgress).values({ id: periodId, tenant_id: f.tenantId, project_id: f.projectId, progress_update_id: progressId, client_request_id: randomUUID(), request_hash: '0'.repeat(64), week_ending: weekEnding, cutoff_at: cutoff, created_by: f.userId, created_at: captureTime, updated_at: captureTime })
  })
  return { progressId, periodId }
}

async function state(f: Fixture) {
  const periods = await db.select().from(projectWeeklyProgress).where(eq(projectWeeklyProgress.tenant_id, f.tenantId)).orderBy(asc(projectWeeklyProgress.id))
  const evidence = await db.select().from(progressUpdates).where(eq(progressUpdates.tenant_id, f.tenantId)).orderBy(asc(progressUpdates.id))
  const audits = await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id))
  return { periods, evidence, audits }
}

function databaseError(error: unknown): { code: unknown; message: string } | null {
  if (!(error instanceof Error)) return null
  if ('code' in error) return { code: error.code, message: error.message }
  return databaseError(error.cause)
}

async function expectGuard(f: Fixture, operation: (tx: DatabaseTransaction) => Promise<unknown>, message: string) {
  const before = await state(f)
  const unexpectedlyAllowed = new Error('Guard unexpectedly allowed the operation; rollback synthetic mutation')
  const error = await db.transaction(async tx => {
    await operation(tx)
    throw unexpectedlyAllowed
  }).catch((failure: unknown) => failure)
  // Always rollback even on RED: do not leave changed/deleted evidence behind.
  expect(await state(f)).toEqual(before)
  expect(databaseError(error)).toEqual({ code: 'P0001', message })
}

suite('Weekly progress PostgreSQL write results', () => {
  it('returns a serialized create result backed by committed evidence and semantic audit', async () => {
    const f = await fixture()
    const input = command(f)
    const result = await service.create(input, f.principal, captureTime)
    expect(result).toMatchObject({ projectId: f.projectId, created: true, changed: true, row: { projectId: f.projectId, clientRequestId: input.clientRequestId, weekEnding, cutoffAt: cutoff.toISOString(), percentByCategory: percentages, notes: input.notes, status: 'open', version: 1, createdBy: f.userId, createdAt: captureTime.toISOString(), updatedAt: captureTime.toISOString(), warSnapshot: null, lockedAt: null, lockedBy: null, lockReason: '' } })
    const persisted = await state(f)
    expect(persisted.periods).toHaveLength(1)
    expect(persisted.periods[0]).toMatchObject({ id: result.row.id, progress_update_id: result.row.progressUpdateId, client_request_id: input.clientRequestId, version: 1 })
    expect(persisted.evidence).toHaveLength(1)
    expect(persisted.evidence[0]).toMatchObject({ id: result.row.progressUpdateId, notes: input.notes, percent_by_category: percentages })
    expect(persisted.audits.filter(a => a.entity_type === 'project_weekly_progress' && a.action === 'create' && isDeepStrictEqual(a.diff, { project_id: f.projectId, week_ending: weekEnding, cutoff_at: cutoff.toISOString() }))).toHaveLength(1)
  })

  it('returns a serialized second capture and commits a new evidence pointer without deleting old evidence', async () => {
    const f = await fixture()
    const original = await seedPeriod(f)
    const input = { ...command(f), notes: 'Second evidence', percentByCategory: { ...percentages, overall_pct: 55 } }
    const result = await service.create(input, f.principal, captureTime)
    expect(result).toMatchObject({ created: false, changed: true, row: { id: original.periodId, projectId: f.projectId, clientRequestId: input.clientRequestId, weekEnding, cutoffAt: cutoff.toISOString(), version: 2, percentByCategory: input.percentByCategory, notes: input.notes, updatedAt: captureTime.toISOString() } })
    expect(result.row.progressUpdateId).not.toBe(original.progressId)
    const persisted = await state(f)
    expect(persisted.periods).toHaveLength(1)
    expect(persisted.periods[0]).toMatchObject({ progress_update_id: result.row.progressUpdateId, version: 2 })
    expect(persisted.evidence).toHaveLength(2)
    expect(persisted.evidence.find(e => e.id === original.progressId)?.notes).toBe('Original evidence')
    expect(persisted.evidence.find(e => e.id === result.row.progressUpdateId)).toMatchObject({ notes: input.notes, percent_by_category: input.percentByCategory })
    expect(persisted.audits.filter(a => a.entity_type === 'project_weekly_progress' && a.action === 'update' && isDeepStrictEqual(a.diff, { project_id: f.projectId, week_ending: weekEnding, version: 2 }))).toHaveLength(1)
  })

  it('returns a serialized lock result with the committed WAR snapshot and lock audit', async () => {
    const f = await fixture()
    const original = await seedPeriod(f)
    const snapshot = { weekEnding, overallPct: percentages.overall_pct, percentByCategory: percentages, notes: 'Original evidence', capturedAt: lockTime.toISOString() }
    const result = await service.lock(f.projectId, original.periodId, { expectedVersion: 1, lockReason: 'Synthetic WAR lock' }, f.principal, lockTime)
    expect(result).toMatchObject({ changed: true, projectId: f.projectId, row: { id: original.periodId, progressUpdateId: original.progressId, status: 'locked', version: 2, cutoffAt: cutoff.toISOString(), lockedAt: lockTime.toISOString(), lockedBy: f.userId, lockReason: 'Synthetic WAR lock', warSnapshot: snapshot } })
    const persisted = await state(f)
    expect(persisted.periods[0]).toMatchObject({ status: 'locked', version: 2, war_snapshot: snapshot, locked_by: f.userId, locked_at: lockTime })
    expect(persisted.evidence).toHaveLength(1)
    expect(persisted.audits.filter(a => a.entity_type === 'project_weekly_progress' && a.action === 'lock')).toHaveLength(1)
  })

  it('rejects foreign-tenant capture and lock without changing either tenant', async () => {
    const f = await fixture()
    const foreign = await fixture()
    const original = await seedPeriod(f)
    const before = await state(f)
    const foreignBefore = await state(foreign)
    await expect(service.create(command(f), foreign.principal, captureTime)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.lock(f.projectId, original.periodId, { expectedVersion: 1, lockReason: '' }, foreign.principal, lockTime)).rejects.toBeInstanceOf(NotFoundException)
    expect(await state(f)).toEqual(before)
    expect(await state(foreign)).toEqual(foreignBefore)
  })

  it.each(['period update', 'period delete', 'linked update', 'linked delete', 'late insert', 'move evidence into locked week'] as const)('rejects %s with the exact database guard and preserves all evidence', async operation => {
    const f = await fixture()
    const original = await seedPeriod(f)
    const unlinkedId = randomUUID()
    await db.insert(progressUpdates).values({ id: unlinkedId, tenant_id: f.tenantId, project_id: f.projectId, week_ending: new Date('2020-01-12T00:00:00.000Z'), percent_by_category: percentages, notes: 'Unlinked evidence', submitted_by: f.userId })
    await db.update(projectWeeklyProgress).set({ status: 'locked', locked_at: lockTime, locked_by: f.userId, war_snapshot: { weekEnding, overallPct: percentages.overall_pct, percentByCategory: percentages, notes: 'Original evidence', capturedAt: lockTime.toISOString() } }).where(and(eq(projectWeeklyProgress.id, original.periodId), eq(projectWeeklyProgress.tenant_id, f.tenantId)))
    const periodScope = and(eq(projectWeeklyProgress.id, original.periodId), eq(projectWeeklyProgress.tenant_id, f.tenantId))
    const linkedScope = and(eq(progressUpdates.id, original.progressId), eq(progressUpdates.tenant_id, f.tenantId))
    switch (operation) {
      case 'period update':
        await expectGuard(f, async tx => tx.update(projectWeeklyProgress).set({ lock_reason: 'Changed' }).where(periodScope), 'Locked weekly progress is immutable')
        break
      case 'period delete':
        await expectGuard(f, async tx => tx.delete(projectWeeklyProgress).where(periodScope), 'Locked weekly progress is immutable')
        break
      case 'linked update':
        await expectGuard(f, async tx => tx.update(progressUpdates).set({ notes: 'Changed' }).where(linkedScope), 'Progress evidence linked to a locked WAR is immutable')
        break
      case 'linked delete':
        await expectGuard(f, async tx => tx.delete(progressUpdates).where(linkedScope), 'Progress evidence linked to a locked WAR is immutable')
        break
      case 'late insert':
        await expectGuard(f, async tx => tx.insert(progressUpdates).values({ tenant_id: f.tenantId, project_id: f.projectId, week_ending: new Date(`${weekEnding}T00:00:00.000Z`), percent_by_category: percentages, submitted_by: f.userId }), 'Weekly progress is past the locked WAR cut-off')
        break
      case 'move evidence into locked week':
        await expectGuard(f, async tx => tx.update(progressUpdates).set({ week_ending: new Date(`${weekEnding}T00:00:00.000Z`) }).where(and(eq(progressUpdates.id, unlinkedId), eq(progressUpdates.tenant_id, f.tenantId))), 'Weekly progress is past the locked WAR cut-off')
    }
  })

  it('allows open-period deletion inside a rollback fixture without deleting linked evidence', async () => {
    const f = await fixture()
    const original = await seedPeriod(f)
    const before = await state(f)
    const rollback = new Error('Rollback synthetic open-period deletion')
    const outcome = await db.transaction(async tx => {
      const deleted = await tx.delete(projectWeeklyProgress).where(and(eq(projectWeeklyProgress.id, original.periodId), eq(projectWeeklyProgress.tenant_id, f.tenantId))).returning({ id: projectWeeklyProgress.id })
      expect(deleted).toEqual([{ id: original.periodId }])
      expect(await tx.select({ id: progressUpdates.id }).from(progressUpdates).where(and(eq(progressUpdates.id, original.progressId), eq(progressUpdates.tenant_id, f.tenantId)))).toEqual([{ id: original.progressId }])
      throw rollback
    }).catch((error: unknown) => error)
    expect(outcome).toBe(rollback)
    expect(await state(f)).toEqual(before)
  })
})
