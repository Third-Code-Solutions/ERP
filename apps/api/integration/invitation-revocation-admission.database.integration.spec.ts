import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { auditLog, db, platformAuditEvents, platformRoleAssignments, platformSupportSessions, platformUserInvitations, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import { PLATFORM_OWNER_EMAIL, type PlatformPrincipal } from '../src/auth/platform-owner.guard'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { PlatformAdministrationService } from '../src/platform-admin/platform-administration.service'
import { PlatformIdentityAdminService } from '../src/platform-admin/platform-identity-admin.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = enabled ? describe : describe.skip

beforeAll(() => {
  if (!enabled) return
  const connection = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)) {
    throw new Error('Invitation admission proof requires an explicitly enabled loopback disposable database')
  }
})

// Independent activation needs committed synthetic users/invitations. Keep their
// immutable evidence. The sole global owner is always an outer rollback fixture,
// never deleted or reassigned to make a subsequent test fit.
async function fixture(options: { active?: boolean; accepted?: boolean; unbound?: boolean; wrongTenant?: boolean; wrongEmail?: boolean } = {}) {
  const tenantId = randomUUID(), otherTenantId = randomUUID(), inviterId = randomUUID(), targetId = randomUUID(), invitationId = randomUUID()
  const email = `${targetId}@integration.test`
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values([
      { id: tenantId, name: 'Invitation admission fixture', slug: `invitation-${tenantId}` },
      { id: otherTenantId, name: 'Unrelated invitation fixture', slug: `invitation-${otherTenantId}` },
    ])
    await tx.insert(users).values([
      { id: inviterId, tenant_id: tenantId, email: `${inviterId}@integration.test`, full_name: 'Synthetic inviter', role: 'admin' },
      { id: targetId, tenant_id: options.wrongTenant ? otherTenantId : tenantId, email, full_name: 'Synthetic invitee', role: 'admin', account_status: options.active || options.accepted ? 'active' : 'invited' },
    ])
    await tx.execute(sql`insert into auth.users(id,email,email_confirmed_at) values (${targetId},${email},now())`)
    await tx.insert(platformUserInvitations).values({
      id: invitationId, tenant_id: tenantId, normalized_email: options.wrongEmail ? `${randomUUID()}@integration.test` : email,
      full_name: 'Synthetic invitee', role: 'admin', invited_by: inviterId,
      auth_user_id: options.unbound ? null : targetId,
      status: options.unbound ? 'pending' : options.accepted ? 'accepted' : 'sent',
    })
  })
  return { tenantId, otherTenantId, inviterId, targetId, invitationId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function snapshot(f: Fixture, tx: DatabaseTransaction | typeof db = db) {
  return {
    user: await tx.select().from(users).where(eq(users.id, f.targetId)),
    invitation: await tx.select().from(platformUserInvitations).where(eq(platformUserInvitations.id, f.invitationId)),
    audit: await tx.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
    platformAudit: await tx.select().from(platformAuditEvents).where(eq(platformAuditEvents.target_id, f.invitationId)).orderBy(asc(platformAuditEvents.id)),
  }
}

async function withOwner(f: Fixture, run: (context: {
  tx: DatabaseTransaction; service: PlatformAdministrationService; principal: PlatformPrincipal & { supportSessionId: string };
  suspend: MockInstance<(userId: string, suspended: boolean) => Promise<void>>;
}) => Promise<void>) {
  const rollback = new Error('Rollback isolated global owner and revocation effects')
  try {
    await db.transaction(async (tx) => {
      const ownerTenant = randomUUID(), ownerId = randomUUID(), supportId = randomUUID()
      await tx.insert(tenants).values({ id: ownerTenant, name: 'Rollback platform owner', slug: `owner-${ownerTenant}` })
      await tx.insert(users).values({ id: ownerId, tenant_id: ownerTenant, email: PLATFORM_OWNER_EMAIL, full_name: 'Synthetic platform owner', role: 'owner' })
      await tx.insert(platformRoleAssignments).values({ user_id: ownerId, normalized_email: PLATFORM_OWNER_EMAIL, created_by: ownerId })
      await tx.insert(platformSupportSessions).values({ id: supportId, actor_id: ownerId, tenant_id: f.tenantId, reason: 'Synthetic admission test', expires_at: new Date(Date.now() + 60_000) })
      const identity = new PlatformIdentityAdminService(new ConfigService({}))
      const suspend = vi.spyOn(identity, 'setSuspended').mockResolvedValue(undefined)
      const module = await Test.createTestingModule({ providers: [PlatformAdministrationService,
        { provide: DatabaseService, useValue: { client: tx } },
        { provide: ConfigService, useValue: new ConfigService({}) },
        { provide: PlatformIdentityAdminService, useValue: identity },
      ] }).compile()
      try {
        await run({ tx, service: module.get(PlatformAdministrationService), principal: { userId: ownerId, email: PLATFORM_OWNER_EMAIL, supportSessionId: supportId }, suspend })
      } finally { await module.close() }
      throw rollback
    })
  } catch (error) { if (error !== rollback) throw error }
}

async function activate(f: Fixture, timeout?: string) {
  return db.transaction(async (tx) => {
    if (timeout) await tx.execute(sql`select set_config('lock_timeout', ${timeout}, true)`)
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${f.targetId}, true)`)
    const [row] = await tx.execute<{ activated: boolean }>(sql`select public.activate_current_invited_user() as activated`)
    return row?.activated
  })
}

function postgresCode(error: unknown): string | undefined {
  const seen = new Set<object>()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && typeof current.code === 'string') return current.code
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
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
      timer = setTimeout(() => reject(new Error('Invitation admission exceeded its contention bound')), 2500)
    })])
  } finally { clearTimeout(timer) }
}

suite('Invitation revocation PostgreSQL admission', () => {
  it.each(['missing', 'ended'] as const)('rejects %s support authority before Auth effects', async (state) => {
    const f = await fixture(), before = await snapshot(f)
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      if (state === 'ended') {
        await tx.update(platformSupportSessions).set({ ended_at: new Date() }).where(eq(platformSupportSessions.id, principal.supportSessionId))
      }
      const caller = state === 'missing' ? { ...principal, supportSessionId: undefined } : principal
      await expect(service.revokeInvitation(f.invitationId, caller)).rejects.toBeInstanceOf(ForbiddenException)
      expect(suspend).not.toHaveBeenCalled()
      expect(await snapshot(f, tx)).toEqual(before)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it.each([
    { label: 'accepted invitation', accepted: true },
    { label: 'active user behind sent invitation', active: true },
    { label: 'different tenant user binding', wrongTenant: true },
    { label: 'different email user binding', wrongEmail: true },
  ])('rejects $label before Auth effects', async (options) => {
    const f = await fixture(options), before = await snapshot(f)
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      await expect(service.revokeInvitation(f.invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(suspend).not.toHaveBeenCalled()
      expect(await snapshot(f, tx)).toEqual(before)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('revokes an unbound pending invitation without Auth effects', async () => {
    const f = await fixture({ unbound: true }), before = await snapshot(f)
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      expect(await service.revokeInvitation(f.invitationId, principal)).toMatchObject({ id: f.invitationId, status: 'revoked' })
      expect(suspend).not.toHaveBeenCalled()
      const after = await snapshot(f, tx)
      expect(after.user).toEqual(before.user)
      expect(after.platformAudit.filter((row) => row.action === 'platform.user.invitation_revoke')).toHaveLength(1)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('rechecks activation committed after the preliminary invitation read', async () => {
    const f = await fixture()
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      const originalTransaction = tx.transaction.bind(tx)
      let first = true
      const hook = vi.spyOn(tx, 'transaction').mockImplementation(async (callback) => {
        if (first) { first = false; expect(await activate(f)).toBe(true) }
        return originalTransaction(callback)
      })
      try {
        await expect(service.revokeInvitation(f.invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
        expect(suspend).not.toHaveBeenCalled()
        const after = await snapshot(f, tx)
        expect(after.user[0]?.account_status).toBe('active')
        expect(after.invitation[0]?.status).toBe('accepted')
        expect(after.platformAudit.filter((row) => row.action === 'platform.user.invitation_revoke')).toHaveLength(0)
      } finally { hook.mockRestore() }
    })
  })

  it.each(['user', 'invitation'] as const)('rejects a contended %s lock without Auth effects', async (held) => {
    const f = await fixture(), before = await snapshot(f), ready = signal(), release = signal()
    const holder = db.transaction(async (tx) => {
      if (held === 'user') await tx.select().from(users).where(eq(users.id, f.targetId)).for('update')
      else await tx.select().from(platformUserInvitations).where(eq(platformUserInvitations.id, f.invitationId)).for('update')
      ready.resolve()
      await release.promise
    })
    try {
      await bounded(Promise.race([ready.promise, holder]))
      await withOwner(f, async ({ service, principal, suspend, tx }) => {
        try {
          await expect(bounded(service.revokeInvitation(f.invitationId, principal))).rejects.toBeInstanceOf(ConflictException)
        } finally { release.resolve() }
        expect(suspend).not.toHaveBeenCalled()
        expect(await snapshot(f, tx)).toEqual(before)
      })
    } finally { release.resolve(); await holder }
    expect(await snapshot(f)).toEqual(before)
  })

  it('holds activation out through the provider effect and transactional revocation', async () => {
    const f = await fixture(), before = await snapshot(f)
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      suspend.mockImplementation(async (userId, suspended) => {
        expect(userId).toBe(f.targetId)
        expect(suspended).toBe(true)
        let failure: unknown
        try { await activate(f, '100ms') } catch (error) { failure = error }
        expect(postgresCode(failure)).toBe('55P03')
      })
      expect(await service.revokeInvitation(f.invitationId, principal)).toMatchObject({ id: f.invitationId, status: 'revoked' })
      expect(suspend).toHaveBeenCalledTimes(1)
      const after = await snapshot(f, tx)
      expect(after.user[0]?.account_status).toBe('disabled')
      expect(after.invitation[0]?.status).toBe('revoked')
      expect(after.platformAudit.filter((row) => row.action === 'platform.user.invitation_revoke')).toHaveLength(1)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('preserves database state and does not report success on a provider failure', async () => {
    const f = await fixture(), before = await snapshot(f)
    await withOwner(f, async ({ service, principal, suspend, tx }) => {
      suspend.mockRejectedValue(new Error('Synthetic provider outcome unavailable'))
      await expect(service.revokeInvitation(f.invitationId, principal)).rejects.toThrow('Synthetic provider outcome unavailable')
      expect(suspend).toHaveBeenCalledExactlyOnceWith(f.targetId, true)
      expect(await snapshot(f, tx)).toEqual(before)
    })
    expect(await snapshot(f)).toEqual(before)
  })
})
