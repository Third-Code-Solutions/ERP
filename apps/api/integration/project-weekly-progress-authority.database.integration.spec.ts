import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  auditLog,
  db,
  progressUpdates,
  projects,
  projectWeeklyProgress,
  tenants,
  users,
} from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpRole } from '@third-code-erp/shared-types/authorization'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { ProjectWeeklyProgressService } from '../src/projects/project-weekly-progress.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const service = new ProjectWeeklyProgressService(new DatabaseService(), new AuditService())

const weekEnding = '2020-01-05'
const cutoff = new Date('2020-01-09T09:00:00.000Z')
const captureTime = new Date('2020-01-08T09:00:00.000Z')
const lockTime = new Date('2020-01-09T10:00:00.000Z')
let futureWeek: string
const percentages = {
  civil_pct: 20,
  electrical_pct: 30,
  mep_pct: 40,
  finishes_pct: 50,
  overall_pct: 35,
}

beforeAll(async () => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Weekly progress authority proof requires an explicit loopback disposable DATABASE_URL')
  }
  const [clock] = await db.execute<{ ready: boolean }>(sql`select now() > ${lockTime.toISOString()}::timestamptz as ready`)
  expect(clock?.ready).toBe(true)
  const [future] = await db.execute<{ week: string }>(sql`select (clock_timestamp() at time zone 'UTC' + interval '14 days')::date::text as week`)
  futureWeek = future!.week
})

// UUID-isolated synthetic fixtures are committed so the service uses an
// independent PostgreSQL transaction. Immutable audit history is retained.
async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const principal: ErpPrincipal = {
    tenantId,
    userId,
    role: 'admin',
    email: `weekly-authority-${userId}@integration.test`,
  }

  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId,
      name: 'Synthetic weekly authority tenant',
      slug: `weekly-authority-${tenantId}`,
    })
    await tx.insert(users).values({
      id: userId,
      tenant_id: tenantId,
      email: principal.email,
      full_name: 'Synthetic weekly authority admin',
      role: 'admin',
    })
    await tx.insert(projects).values({
      id: projectId,
      tenant_id: tenantId,
      name: 'Synthetic weekly authority project',
      client: 'Synthetic',
      status: 'active',
      project_type: 'mep',
      created_by: userId,
    })
  })

  return { tenantId, userId, projectId, principal }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

type Outcome<T> = { value: T } | { error: unknown }

function createCommand(f: Fixture) {
  return {
    projectId: f.projectId,
    clientRequestId: randomUUID(),
    weekEnding: futureWeek,
    percentByCategory: percentages,
    notes: 'Synthetic weekly authority capture',
  }
}

async function seedPeriod(f: Fixture) {
  const progressId = randomUUID()
  const periodId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(progressUpdates).values({
      id: progressId,
      tenant_id: f.tenantId,
      project_id: f.projectId,
      week_ending: new Date(`${weekEnding}T00:00:00.000Z`),
      percent_by_category: percentages,
      notes: 'Synthetic weekly authority evidence',
      submitted_by: f.userId,
    })
    await tx.insert(projectWeeklyProgress).values({
      id: periodId,
      tenant_id: f.tenantId,
      project_id: f.projectId,
      progress_update_id: progressId,
      client_request_id: randomUUID(),
      request_hash: '0'.repeat(64),
      week_ending: weekEnding,
      cutoff_at: cutoff,
      created_by: f.userId,
      created_at: captureTime,
      updated_at: captureTime,
    })
  })
  return { progressId, periodId }
}

async function state(f: Fixture) {
  const periods = await db
    .select()
    .from(projectWeeklyProgress)
    .where(eq(projectWeeklyProgress.tenant_id, f.tenantId))
    .orderBy(asc(projectWeeklyProgress.id))
  const evidence = await db
    .select()
    .from(progressUpdates)
    .where(eq(progressUpdates.tenant_id, f.tenantId))
    .orderBy(asc(progressUpdates.id))
  const audits = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenant_id, f.tenantId))
    .orderBy(asc(auditLog.id))
  return { periods, evidence, audits }
}

async function markActorStatus(f: Fixture, status: 'invited' | 'suspended' | 'disabled') {
  await db
    .update(users)
    .set({
      account_status: status,
      status_reason: 'Synthetic current-authority regression',
      status_changed_at: new Date(),
      status_changed_by: f.userId,
    })
    .where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId)))
}

async function markTenantStatus(f: Fixture, status: 'suspended' | 'disabled') {
  await db
    .update(tenants)
    .set({
      status,
      status_reason: 'Synthetic current-authority regression',
      status_changed_at: new Date(),
      status_changed_by: f.userId,
    })
    .where(eq(tenants.id, f.tenantId))
}

async function markCurrentRole(f: Fixture, role: ErpRole) {
  await db
    .update(users)
    .set({ role })
    .where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId)))
}

async function invoke<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  return operation().then((value) => ({ value }), (error: unknown) => ({ error }))
}

async function expectRejectedWithoutMutation<T>(
  f: Fixture,
  before: Awaited<ReturnType<typeof state>>,
  operation: () => Promise<T>,
  matches: (error: unknown) => boolean,
  label: string,
) {
  const outcome = await invoke(operation)
  if ('value' in outcome) {
    // A successful no-op is still an authorization failure: callers need an
    // explicit rejection, not merely an unchanged snapshot.
    const after = await state(f)
    expect(after).toEqual(before)
    throw new Error(`${label} unexpectedly resolved`)
  }
  expect(matches(outcome.error)).toBe(true)
  expect(await state(f)).toEqual(before)
}

function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 2_500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not finish within ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

type ContentionTarget = 'actor' | 'tenant' | 'project' | 'audit'

async function invokeWithHeldLock<T>(
  f: Fixture,
  target: ContentionTarget,
  operation: () => Promise<T>,
): Promise<{ outcome: Outcome<T>; timedOut: boolean }> {
  const ready = signal()
  const release = signal()
  const holder = db.transaction(async (tx) => {
    if (target === 'actor') {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, f.userId)).for('update')
    } else if (target === 'tenant') {
      await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
    } else if (target === 'project') {
      await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, f.projectId)).for('update')
    } else {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + f.tenantId}, 0))`)
    }
    ready.resolve()
    await release.promise
  })

  let earlyOutcome: Outcome<T> | undefined
  let timedOut = false
  let pending: Promise<Outcome<T>> | undefined
  try {
    await bounded(Promise.race([ready.promise, holder]), `the ${target} lock holder`)
    // Start only after the holder has acquired its lock; otherwise the test
    // could accidentally let the command win the race and prove nothing.
    pending = invoke(operation)
    try {
      earlyOutcome = await bounded(pending, `weekly ${target} contention`, 2_500)
    } catch {
      timedOut = true
    }
  } finally {
    release.resolve()
    await bounded(holder, `the ${target} lock holder release`)
  }

  if (!pending) throw new Error(`weekly ${target} contention did not start`)
  const outcome = earlyOutcome ?? await bounded(pending, `weekly ${target} operation settlement`)
  return { outcome, timedOut }
}

async function expectFastConflict<T>(
  f: Fixture,
  target: ContentionTarget,
  before: Awaited<ReturnType<typeof state>>,
  operation: () => Promise<T>,
  label: string,
) {
  const contention = await invokeWithHeldLock(f, target, operation)
  if (contention.timedOut) {
    // The holder has already been released and the command fully settled in
    // invokeWithHeldLock, so no background transaction survives this failure.
    expect(await state(f)).toEqual(before)
    throw new Error(`${label} did not fail fast under ${target} contention`)
  }
  if ('value' in contention.outcome) {
    expect(await state(f)).toEqual(before)
    throw new Error(`${label} unexpectedly resolved under ${target} contention`)
  }
  expect(contention.outcome.error).toBeInstanceOf(ConflictException)
  expect(await state(f)).toEqual(before)
}

suite('Weekly progress current-authority PostgreSQL admission', () => {
  it.each(['invited', 'suspended', 'disabled'] as const)('rejects capture by a currently %s actor before any period, evidence, or audit write', async (status) => {
    const f = await fixture()
    await markActorStatus(f, status)
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.create(createCommand(f), f.principal),
      (error) => error instanceof ForbiddenException,
      `capture with actor status ${status}`,
    )
  })

  it.each(['invited', 'suspended', 'disabled'] as const)('rejects WAR lock by a currently %s actor before changing the period or audit history', async (status) => {
    const f = await fixture()
    const seeded = await seedPeriod(f)
    await markActorStatus(f, status)
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.lock(
        f.projectId,
        seeded.periodId,
        { expectedVersion: 1, lockReason: 'Synthetic current-authority lock' },
        f.principal,
      ),
      (error) => error instanceof ForbiddenException,
      `lock with actor status ${status}`,
    )
  })

  it.each(['suspended', 'disabled'] as const)('rejects capture when the current tenant is %s before any period, evidence, or audit write', async (status) => {
    const f = await fixture()
    await markTenantStatus(f, status)
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.create(createCommand(f), f.principal),
      (error) => error instanceof ForbiddenException,
      `capture with tenant status ${status}`,
    )
  })

  it.each(['suspended', 'disabled'] as const)('rejects WAR lock when the current tenant is %s before changing the period or audit history', async (status) => {
    const f = await fixture()
    const seeded = await seedPeriod(f)
    await markTenantStatus(f, status)
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.lock(
        f.projectId,
        seeded.periodId,
        { expectedVersion: 1, lockReason: 'Synthetic current-authority lock' },
        f.principal,
      ),
      (error) => error instanceof ForbiddenException,
      `lock with tenant status ${status}`,
    )
  })

  it('uses the current database role after a stale admin principal is demoted to viewer for capture', async () => {
    const f = await fixture()
    await markCurrentRole(f, 'viewer')
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.create(createCommand(f), f.principal),
      (error) => error instanceof ForbiddenException,
      'capture after current-role demotion',
    )
  })

  it('uses the current database role after a stale admin principal is demoted to viewer for WAR lock', async () => {
    const f = await fixture()
    const seeded = await seedPeriod(f)
    await markCurrentRole(f, 'viewer')
    const before = await state(f)
    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.lock(
        f.projectId,
        seeded.periodId,
        { expectedVersion: 1, lockReason: 'Synthetic current-authority lock' },
        f.principal,
      ),
      (error) => error instanceof ForbiddenException,
      'lock after current-role demotion',
    )
  })

  it.each([
    ['owner', true],
    ['estimator', false],
    ['pm', true],
    ['admin', true],
    ['sales', false],
    ['commercial', false],
    ['design', false],
    ['sd_pm_pe', true],
    ['finance', false],
    ['procurement', false],
    ['safety', false],
    ['cx', false],
    ['viewer', false],
  ] as const)('enforces the current capture capability for role %s', async (role, allowed) => {
    const f = await fixture()
    await markCurrentRole(f, role)
    const before = await state(f)
    const outcome = await invoke(() => service.create(createCommand(f), f.principal))
    if (allowed) {
      if ('error' in outcome) throw outcome.error
      expect(outcome.value).toMatchObject({ projectId: f.projectId, created: true, changed: true })
      return
    }
    if ('value' in outcome) {
      expect(await state(f)).toEqual(before)
      throw new Error(`capture unexpectedly resolved for role ${role}`)
    }
    expect(outcome.error).toBeInstanceOf(ForbiddenException)
    expect(await state(f)).toEqual(before)
  })

  it.each([
    ['owner', true],
    ['estimator', false],
    ['pm', true],
    ['admin', true],
    ['sales', false],
    ['commercial', true],
    ['design', false],
    ['sd_pm_pe', true],
    ['finance', false],
    ['procurement', false],
    ['safety', false],
    ['cx', false],
    ['viewer', false],
  ] as const)('enforces the current WAR-lock capability for role %s', async (role, allowed) => {
    const f = await fixture()
    const seeded = await seedPeriod(f)
    await markCurrentRole(f, role)
    const before = await state(f)
    const outcome = await invoke(() => service.lock(
      f.projectId,
      seeded.periodId,
      { expectedVersion: 1, lockReason: 'Synthetic capability matrix lock' },
      f.principal,
    ))
    if (allowed) {
      if ('error' in outcome) throw outcome.error
      expect(outcome.value).toMatchObject({ projectId: f.projectId, changed: true, row: { status: 'locked', version: 2 } })
      return
    }
    if ('value' in outcome) {
      expect(await state(f)).toEqual(before)
      throw new Error(`WAR lock unexpectedly resolved for role ${role}`)
    }
    expect(outcome.error).toBeInstanceOf(ForbiddenException)
    expect(await state(f)).toEqual(before)
  })

  it('rejects a foreign project and a retired project without changing weekly state', async () => {
    const f = await fixture()
    const foreign = await fixture()
    const foreignPeriod = await seedPeriod(foreign)
    const before = await state(f)
    const foreignBefore = await state(foreign)

    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.create({ ...createCommand(f), projectId: foreign.projectId }, f.principal),
      (error) => error instanceof NotFoundException,
      'foreign-project capture',
    )
    expect(await state(foreign)).toEqual(foreignBefore)

    await expectRejectedWithoutMutation(
      f,
      before,
      () => service.lock(
        foreign.projectId,
        foreignPeriod.periodId,
        { expectedVersion: 1, lockReason: 'Synthetic foreign-project lock' },
        f.principal,
      ),
      (error) => error instanceof NotFoundException,
      'foreign-project WAR lock',
    )
    expect(await state(foreign)).toEqual(foreignBefore)

    const retired = await fixture()
    const retiredPeriod = await seedPeriod(retired)
    await db.update(projects).set({
      deleted_at: new Date(),
      deleted_by: retired.userId,
      deletion_reason: 'Synthetic retired project',
    }).where(and(eq(projects.id, retired.projectId), eq(projects.tenant_id, retired.tenantId)))
    const retiredBefore = await state(retired)
    await expectRejectedWithoutMutation(
      retired,
      retiredBefore,
      () => service.create(createCommand(retired), retired.principal),
      (error) => error instanceof NotFoundException,
      'retired-project capture',
    )
    await expectRejectedWithoutMutation(
      retired,
      retiredBefore,
      () => service.lock(
        retired.projectId,
        retiredPeriod.periodId,
        { expectedVersion: 1, lockReason: 'Synthetic retired-project lock' },
        retired.principal,
      ),
      (error) => error instanceof NotFoundException,
      'retired-project WAR lock',
    )
  })

  it.each(['actor', 'tenant', 'project', 'audit'] as const)('fails fast on %s contention for capture without durable effects', async (target) => {
    const f = await fixture()
    const before = await state(f)
    await expectFastConflict(
      f,
      target,
      before,
      () => service.create(createCommand(f), f.principal),
      'capture',
    )
  })

  it.each(['actor', 'tenant', 'project', 'audit'] as const)('fails fast on %s contention for WAR lock without durable effects', async (target) => {
    const f = await fixture()
    const seeded = await seedPeriod(f)
    const before = await state(f)
    await expectFastConflict(
      f,
      target,
      before,
      () => service.lock(
        f.projectId,
        seeded.periodId,
        { expectedVersion: 1, lockReason: `Synthetic ${target} contention` },
        f.principal,
      ),
      'WAR lock',
    )
  })
})
