import { createHash, randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  becomeAuthenticated,
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
  type TwoTenants,
} from './_db-harness'
import { resolveAuthRuntime, type AuthRuntime } from './auth-api-runtime'

const INVITABLE_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const

type InvitableRole = (typeof INVITABLE_ROLES)[number]

type AuthCreateResult = {
  id: string | null
  ok: boolean
}

type InvitationFixture = {
  id: string
  token: string
}

type SqlExecutor = postgres.Sql | postgres.TransactionSql

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Expected one database row')
  return row
}

function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function testEmail(label: string): string {
  return `${label}-${randomUUID()}@probe.test`
}

async function createAuthUser(
  runtime: AuthRuntime,
  email: string,
  userMetadata: Record<string, unknown>,
  appMetadata?: Record<string, unknown>
): Promise<AuthCreateResult> {
  const response = await fetch(`${runtime.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: runtime.serviceRoleKey,
      authorization: `Bearer ${runtime.serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: 'Not-a-production-password-9284!',
      email_confirm: true,
      user_metadata: userMetadata,
      ...(appMetadata ? { app_metadata: appMetadata } : {}),
    }),
  })
  const payload = (await response.json().catch(() => null)) as {
    id?: string
  } | null
  return { id: payload?.id ?? null, ok: response.ok }
}

async function createIntent(
  sql: SqlExecutor,
  fixture: Pick<TwoTenants, 'tenantA' | 'userA'>,
  email: string,
  role: InvitableRole,
  options: { createdAt?: Date; expiresAt?: Date; token?: string } = {}
): Promise<InvitationFixture> {
  const token = options.token ?? createOpaqueToken()
  const createdAt = options.createdAt ?? new Date()
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)
  const { id } = first(await sql<{ id: string }[]>`
    insert into public.tenant_invitation_intents (
      tenant_id,
      invited_email,
      invited_role,
      invited_by,
      created_by,
      token_hash,
      created_at,
      expires_at
    )
    values (
      ${fixture.tenantA}::uuid,
      ${email},
      ${role}::public.role,
      ${fixture.userA}::uuid,
      ${fixture.userA}::uuid,
      ${hashToken(token)},
      ${createdAt},
      ${expiresAt}
    )
    returning id
  `)
  return { id, token }
}

async function persistTwoTenants(sql: postgres.Sql): Promise<TwoTenants> {
  return sql.begin(async (transaction) =>
    seedTwoTenants(transaction as postgres.TransactionSql)
  )
}

async function identityCounts(
  sql: postgres.Sql,
  email: string
): Promise<{ auth: number; profiles: number; tenants: number }> {
  const auth = first(await sql<{ count: number }[]>`
    select count(*)::int as count from auth.users where email = ${email}
  `).count
  const profiles = first(await sql<{ count: number }[]>`
    select count(*)::int as count from public.users where email = ${email}
  `).count
  const tenants = first(await sql<{ count: number }[]>`
    select count(*)::int as count from public.tenants
  `).count
  return { auth, profiles, tenants }
}

describe('ADR-030 real Supabase Auth Admin API proof', () => {
  let sql: postgres.Sql
  let authRuntime: AuthRuntime

  beforeAll(() => {
    // Deliberately fail rather than skip when Agent 13 has not supplied the
    // isolated local-Supabase runtime emitted by `supabase status --output env`.
    authRuntime = resolveAuthRuntime()
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('self-signup creates one isolated admin tenant through the actual Auth API', async () => {
    const email = testEmail('self-signup')
    const before = await identityCounts(sql, email)
    const result = await createAuthUser(authRuntime, email, {
      full_name: 'Self Signup Probe',
      company_name: 'Self Signup Builders',
      organization_type: 'construction',
      provisioning_mode: 'self_signup_v1',
    })
    const after = await identityCounts(sql, email)
    const profile = first(await sql<{
      full_name: string
      role: string
      tenant_id: string
    }[]>`
      select full_name, role::text as role, tenant_id
        from public.users
       where email = ${email}
    `)
    const memberships = first(await sql<{ count: number }[]>`
      select count(*)::int as count
        from public.tenant_memberships
       where user_id = ${result.id}::uuid
    `).count

    expect(result.ok).toBe(true)
    expect(result.id).not.toBeNull()
    expect(after).toEqual({
      auth: before.auth + 1,
      profiles: before.profiles + 1,
      tenants: before.tenants + 1,
    })
    expect(profile).toMatchObject({ full_name: 'Self Signup Probe', role: 'admin' })
    expect(memberships).toBe(1)
  })

  it('provisions all 13 roles into the existing tenant and consumes token-free intents once', async () => {
    const fixture = await persistTwoTenants(sql)
    const beforeTenants = first(await sql<{ count: number }[]>`
      select count(*)::int as count from public.tenants
    `).count
    const provisioned: Array<{ email: string; id: string; intentId: string; role: InvitableRole }> = []

    for (const role of INVITABLE_ROLES) {
      const email = testEmail(`role-${role}`)
      const intent = await createIntent(sql, fixture, email, role)
      const result = await createAuthUser(authRuntime, email, {
        full_name: `Role ${role}`,
        provisioning_mode: 'tenant_invitation_v1',
        tenant_invitation_token_v1: intent.token,
      })
      expect(result.ok).toBe(true)
      expect(result.id).not.toBeNull()
      provisioned.push({
        email,
        id: result.id as string,
        intentId: intent.id,
        role,
      })
    }

    const afterTenants = first(await sql<{ count: number }[]>`
      select count(*)::int as count from public.tenants
    `).count
    const profiles = await sql<{
      email: string
      membership_count: number
      role: string
      tenant_id: string
    }[]>`
      select
        profile.email,
        profile.role::text as role,
        profile.tenant_id,
        (
          select count(*)::int
            from public.tenant_memberships membership
           where membership.user_id = profile.id
        ) as membership_count
      from public.users profile
      where profile.id = any(${provisioned.map((entry) => entry.id)}::uuid[])
      order by profile.email
    `
    const intentState = await sql<{
      consumed: boolean
      token_persisted: boolean
    }[]>`
      select
        intent.consumed_at is not null
          and intent.consumed_by_user_id is not null as consumed,
        exists (
          select 1 from auth.users identity
           where identity.id = intent.consumed_by_user_id
             and identity.raw_user_meta_data ? 'tenant_invitation_token_v1'
        ) as token_persisted
      from public.tenant_invitation_intents intent
      where intent.id = any(${provisioned.map((entry) => entry.intentId)}::uuid[])
      order by intent.id
    `
    const audits = await sql<{
      actor_id: string | null
      action: string
      diff: unknown
    }[]>`
      select actor_id, action, diff
        from public.audit_log
       where entity_type = 'tenant_invitation_intents'
         and entity_id = any(${provisioned.map((entry) => entry.intentId)}::uuid[])
       order by id
    `

    expect(afterTenants).toBe(beforeTenants)
    expect(profiles).toHaveLength(INVITABLE_ROLES.length)
    expect(profiles).toEqual(
      [...provisioned]
        .sort((left, right) => left.email.localeCompare(right.email))
        .map((entry) => ({
          email: entry.email,
          membership_count: 1,
          role: entry.role,
          tenant_id: fixture.tenantA,
        }))
    )
    expect(intentState).toHaveLength(INVITABLE_ROLES.length)
    expect(intentState.every((intent) => intent.consumed && !intent.token_persisted)).toBe(true)
    expect(audits).toHaveLength(INVITABLE_ROLES.length * 2)
    expect(audits.every((audit) => audit.actor_id === fixture.userA)).toBe(true)
    expect(audits.map((audit) => audit.action).sort()).toEqual(
      INVITABLE_ROLES.flatMap(() => ['intent_consumed', 'intent_created']).sort()
    )
    expect(audits.every((audit) => !JSON.stringify(audit.diff).match(/token|hash/i))).toBe(true)
  })

  it('fails closed for missing, malformed, unknown, expired, revoked, email-mismatched, replayed, legacy, and mode-mismatched provisioning', async () => {
    const fixture = await persistTwoTenants(sql)
    const malformedEmail = testEmail('malformed')
    const unknownEmail = testEmail('unknown')
    const expiredEmail = testEmail('expired')
    const revokedEmail = testEmail('revoked')
    const mismatchEmail = testEmail('mismatch')
    const replayEmail = testEmail('replay')
    const replaySecondEmail = testEmail('replay-second')
    const legacyEmail = testEmail('legacy')
    const missingModeEmail = testEmail('missing-mode')
    const unknownModeEmail = testEmail('unknown-mode')
    const selfSignupTokenEmail = testEmail('self-signup-token')
    const inviteMissingTokenEmail = testEmail('invite-missing-token')
    const beforeTenants = first(await sql<{ count: number }[]>`
      select count(*)::int as count from public.tenants
    `).count

    const malformed = await createAuthUser(authRuntime, malformedEmail, {
      full_name: 'Malformed',
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: 'not-a-valid-token',
    })
    const unknown = await createAuthUser(authRuntime, unknownEmail, {
      full_name: 'Unknown',
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: createOpaqueToken(),
    })
    const expired = await createIntent(sql, fixture, expiredEmail, 'viewer', {
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    const expiredResult = await createAuthUser(authRuntime, expiredEmail, {
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: expired.token,
    })
    const revoked = await createIntent(sql, fixture, revokedEmail, 'viewer')
    await sql`
      update public.tenant_invitation_intents
         set revoked_at = clock_timestamp(),
             revoked_by = ${fixture.userA}::uuid,
             revocation_reason = 'test revocation'
       where id = ${revoked.id}::uuid
    `
    const revokedResult = await createAuthUser(authRuntime, revokedEmail, {
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: revoked.token,
    })
    const mismatch = await createIntent(sql, fixture, testEmail('intent-email'), 'viewer')
    const mismatchResult = await createAuthUser(authRuntime, mismatchEmail, {
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: mismatch.token,
    })
    const replay = await createIntent(sql, fixture, replayEmail, 'viewer')
    const replayFirst = await createAuthUser(authRuntime, replayEmail, {
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: replay.token,
    })
    const replaySecond = await createAuthUser(authRuntime, replaySecondEmail, {
      provisioning_mode: 'tenant_invitation_v1',
      tenant_invitation_token_v1: replay.token,
    })
    const legacy = await createAuthUser(
      authRuntime,
      legacyEmail,
      { full_name: 'Legacy Marker' },
      { tenant_invite_v1: { tenant_id: fixture.tenantA, role: 'viewer', invited_by: fixture.userA } }
    )
    const missingMode = await createAuthUser(authRuntime, missingModeEmail, {
      full_name: 'Missing Mode',
    })
    const unknownMode = await createAuthUser(authRuntime, unknownModeEmail, {
      full_name: 'Unknown Mode',
      provisioning_mode: 'other_mode_v1',
    })
    const selfSignupWithToken = await createAuthUser(authRuntime, selfSignupTokenEmail, {
      full_name: 'Self Signup With Token',
      provisioning_mode: 'self_signup_v1',
      tenant_invitation_token_v1: createOpaqueToken(),
    })
    const inviteMissingToken = await createAuthUser(authRuntime, inviteMissingTokenEmail, {
      full_name: 'Invite Missing Token',
      provisioning_mode: 'tenant_invitation_v1',
    })

    expect(malformed.ok).toBe(false)
    expect(unknown.ok).toBe(false)
    expect(expiredResult.ok).toBe(false)
    expect(revokedResult.ok).toBe(false)
    expect(mismatchResult.ok).toBe(false)
    expect(replayFirst.ok).toBe(true)
    expect(replaySecond.ok).toBe(false)
    expect(legacy.ok).toBe(false)
    expect(missingMode.ok).toBe(false)
    expect(unknownMode.ok).toBe(false)
    expect(selfSignupWithToken.ok).toBe(false)
    expect(inviteMissingToken.ok).toBe(false)
    for (const email of [
      malformedEmail,
      unknownEmail,
      expiredEmail,
      revokedEmail,
      mismatchEmail,
      replaySecondEmail,
      legacyEmail,
      missingModeEmail,
      unknownModeEmail,
      selfSignupTokenEmail,
      inviteMissingTokenEmail,
    ]) {
      expect(await identityCounts(sql, email)).toEqual({
        auth: 0,
        profiles: 0,
        tenants: beforeTenants,
      })
    }
    const replayIntent = first(await sql<{
      consumed_by_user_id: string | null
      consumed_count: number
    }[]>`
      select
        consumed_by_user_id,
        count(*) over ()::int as consumed_count
      from public.tenant_invitation_intents
      where id = ${replay.id}::uuid
    `)
    expect(replayIntent.consumed_by_user_id).toBe(replayFirst.id)
    expect(replayIntent.consumed_count).toBe(1)
  })

  it('rejects cross-tenant authority, client access, and audit mutation', async () => {
    const fixture = await persistTwoTenants(sql)
    const token = createOpaqueToken()
    await expect(sql`
      insert into public.tenant_invitation_intents (
        tenant_id, invited_email, invited_role, invited_by, created_by,
        token_hash, expires_at
      )
      values (
        ${fixture.tenantB}::uuid, ${testEmail('cross-tenant')},
        'viewer'::public.role, ${fixture.userA}::uuid, ${fixture.userA}::uuid,
        ${hashToken(token)}, clock_timestamp() + interval '1 hour'
      )
    `).rejects.toThrow()
    await expect(sql`
      select 'not-a-role'::public.role
    `).rejects.toThrow()

    const rlsAllowed = await inRollback(sql, async (transaction) => {
      await becomeAuthenticated(transaction, fixture.userA)
      try {
        const rows = await transaction`select id from public.tenant_invitation_intents limit 1`
        return rows.length > 0
      } catch {
        return false
      }
    })
    const intent = await createIntent(sql, fixture, testEmail('immutable-audit'), 'viewer')
    const audit = first(await sql<{ id: number }[]>`
      select id
        from public.audit_log
       where entity_type = 'tenant_invitation_intents'
         and entity_id = ${intent.id}::uuid
       order by id desc
       limit 1
    `)
    const auditUpdateAllowed = await inRollback(sql, async (transaction) => {
      await transaction`
        update public.audit_log
           set actor_id = null
         where id = ${audit.id}
      `
      const updated = first(await transaction<{ actor_id: string | null }[]>`
        select actor_id
          from public.audit_log
         where id = ${audit.id}
      `)
      return updated.actor_id === null
    })
    const auditDeleteAllowed = await inRollback(sql, async (transaction) => {
      await transaction`
        delete from public.audit_log
         where id = ${audit.id}
      `
      const remaining = await transaction`
        select 1
          from public.audit_log
         where id = ${audit.id}
      `
      return remaining.length === 0
    })

    expect(rlsAllowed).toBe(false)
    expect(auditUpdateAllowed).toBe(false)
    expect(auditDeleteAllowed).toBe(false)
  })
})
