import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { auditLog, db, tenants, userRoleAssignmentRequests, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { UserRoleAssignmentService } from '../src/admin/user-role-assignment.service'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = enabled ? describe : describe.skip

beforeAll(() => {
  if (!enabled) return
  const connection = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)) {
    throw new Error('Lifecycle admission proof requires an explicitly enabled loopback disposable database')
  }
})

// Independent connections require committed synthetic fixtures. Retain them and
// their immutable audit evidence until the disposable database is reset.
async function fixture() {
  const tenantId = randomUUID(), actorId = randomUUID(), targetId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId: actorId, role: 'owner', email: `${actorId}@integration.test` }
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Lifecycle admission proof', slug: `lifecycle-${tenantId}` })
    await tx.insert(users).values([
      { id: actorId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic owner', role: 'owner' },
      { id: targetId, tenant_id: tenantId, email: `${targetId}@integration.test`, full_name: 'Synthetic target', role: 'viewer' },
    ])
  })
  const audit = new AuditService()
  const service = new UserRoleAssignmentService(new ConfigService({
    ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED: true,
    ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS: [tenantId],
  }), new DatabaseService(), audit)
  const command = { expectedRole: 'viewer' as const, role: 'sales' as const }
  const requestId = randomUUID()
  return { tenantId, actorId, targetId, principal, service, audit, command, requestId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    users: await db.select().from(users).where(eq(users.tenant_id, f.tenantId)).orderBy(asc(users.id)),
    requests: await db.select().from(userRoleAssignmentRequests).where(eq(userRoleAssignmentRequests.tenant_id, f.tenantId)).orderBy(asc(userRoleAssignmentRequests.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}

function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Lifecycle admission did not finish within its contention bound')), 2500)
    })])
  } finally { clearTimeout(timer) }
}

async function observeBlocking(waiter: number, blocker: number): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const [row] = await db.execute<{ blocked: boolean }>(sql`select ${blocker}::int = any(pg_blocking_pids(${waiter}::int)) as blocked`)
    if (row?.blocked) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected PostgreSQL lifecycle lock blocking was not observed')
}

async function withLock(lock: (tx: DatabaseTransaction) => Promise<void>, operation: () => Promise<void>) {
  const ready = signal(), release = signal()
  const holder = db.transaction(async (tx) => {
    await lock(tx)
    ready.resolve()
    await release.promise
  })
  try {
    await bounded(Promise.race([ready.promise, holder]))
    await operation()
  } finally {
    release.resolve()
    await holder
  }
}

suite('User role lifecycle PostgreSQL admission', () => {
  it.each(['invited', 'suspended', 'disabled'] as const)('rejects a stale principal whose actor is %s', async (status) => {
    const f = await fixture()
    await db.update(users).set({ account_status: status, status_reason: 'Synthetic lifecycle proof', status_changed_at: new Date(), status_changed_by: f.actorId }).where(eq(users.id, f.actorId))
    const before = await snapshot(f)
    await expect(f.service.assign(f.targetId, f.command, f.principal, f.requestId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })

  it.each(['suspended', 'disabled'] as const)('rejects a stale principal whose tenant is %s', async (status) => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic lifecycle proof', status_changed_at: new Date(), status_changed_by: f.actorId }).where(eq(tenants.id, f.tenantId))
    const before = await snapshot(f)
    await expect(f.service.assign(f.targetId, f.command, f.principal, f.requestId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })

  it.each(['actor', 'tenant', 'target', 'audit'] as const)('rejects held %s admission without durable effects', async (held) => {
    const f = await fixture(), before = await snapshot(f)
    await withLock(async (tx) => {
      if (held === 'audit') {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + f.tenantId}, 0))`)
      } else if (held === 'tenant') {
        await tx.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
      } else {
        await tx.select().from(users).where(eq(users.id, held === 'actor' ? f.actorId : f.targetId)).for('update')
      }
    }, async () => {
      await expect(bounded(f.service.assign(f.targetId, f.command, f.principal, f.requestId))).rejects.toBeInstanceOf(ConflictException)
      expect(await snapshot(f)).toEqual(before)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('replays an active exact request without another role or audit mutation', async () => {
    const f = await fixture()
    const result = await f.service.assign(f.targetId, f.command, f.principal, f.requestId)
    expect(result).toMatchObject({ status: 'updated', previousRole: 'viewer', role: 'sales' })
    const before = await snapshot(f)
    expect(before.requests).toHaveLength(1)
    expect(before.requests[0]?.state).toBe('succeeded')
    // Replay precedes target admission, even when another writer holds it.
    await withLock(async (tx) => {
      await tx.select().from(users).where(eq(users.id, f.targetId)).for('update')
    }, async () => {
      expect(await bounded(f.service.assign(f.targetId, f.command, f.principal, f.requestId))).toEqual(result)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('breaks user-before-tenant inversion while a platform-shaped writer waits for tenant UPDATE', async () => {
    const f = await fixture(), before = await snapshot(f)
    const userLocked = signal(), admitted = signal(), continueAssignment = signal()
    let assignmentPid = 0, otherPid = 0
    const original = f.audit.tryLockTenantChain.bind(f.audit)
    const admission = vi.spyOn(f.audit, 'tryLockTenantChain').mockImplementation(async (tx, tenantId) => {
      const acquired = await original(tx, tenantId)
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      assignmentPid = backend!.pid
      admitted.resolve()
      await continueAssignment.promise
      return acquired
    })
    // A synthetic user lock reproduces lockOwner's user→tenant order without
    // changing the sole real platform assignment or contacting Auth.
    const other = db.transaction(async (tx) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      otherPid = backend!.pid
      await tx.select().from(users).where(eq(users.id, f.targetId)).for('update')
      userLocked.resolve()
      await admitted.promise
      await tx.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
    })
    let assignment: Promise<unknown> | undefined
    try {
      await bounded(userLocked.promise)
      assignment = f.service.assign(f.targetId, f.command, f.principal, f.requestId).catch((error: unknown) => error)
      await bounded(admitted.promise)
      await observeBlocking(otherPid, assignmentPid)
      continueAssignment.resolve()
      expect(await bounded(assignment)).toBeInstanceOf(ConflictException)
      await bounded(other)
      expect(await snapshot(f)).toEqual(before)
    } finally {
      admitted.resolve()
      continueAssignment.resolve()
      admission.mockRestore()
      await Promise.allSettled([other, assignment])
    }
  })

  it('bounds an old writer unique-key wait while that writer waits for the newly admitted audit chain', async () => {
    const f = await fixture(), before = await snapshot(f)
    const auditAdmitted = signal(), oldStarted = signal()
    let assignmentPid = 0, oldPid = 0
    const rollback = new Error('Roll back synthetic old writer after contention proof')
    const original = f.audit.tryLockTenantChain.bind(f.audit)
    const admission = vi.spyOn(f.audit, 'tryLockTenantChain').mockImplementation(async (tx, tenantId) => {
      const acquired = await original(tx, tenantId)
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      assignmentPid = backend!.pid
      auditAdmitted.resolve()
      await oldStarted.promise
      // The old INSERT owns the unique-index entry before its audit trigger
      // can acquire the advisory lock held by this new-version transaction.
      await observeBlocking(oldPid, assignmentPid)
      return acquired
    })
    const old = db.transaction(async (tx) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      oldPid = backend!.pid
      // Keep PostgreSQL's deadlock detector behind the application's one-second
      // lock timeout so this case deterministically proves typed timeout recovery.
      await tx.execute(sql`select set_config('deadlock_timeout', '5s', true)`)
      await auditAdmitted.promise
      oldStarted.resolve()
      await tx.insert(userRoleAssignmentRequests).values({
        tenant_id: f.tenantId, idempotency_key: f.requestId,
        request_hash: '0'.repeat(64), target_user_id: f.targetId, created_by: f.actorId,
      })
      throw rollback
    }).catch((error: unknown) => error)
    try {
      const result = f.service.assign(f.targetId, f.command, f.principal, f.requestId)
      await expect(bounded(result)).rejects.toBeInstanceOf(ConflictException)
      expect(await bounded(old)).toBe(rollback)
      expect(await snapshot(f)).toEqual(before)
    } finally {
      auditAdmitted.resolve()
      oldStarted.resolve()
      admission.mockRestore()
      await old
    }
  })
})
