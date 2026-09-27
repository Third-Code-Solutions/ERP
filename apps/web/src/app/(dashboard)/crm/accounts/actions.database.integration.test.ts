import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { accounts, auditLog, tenants, users } from '@third-code-erp/database/schema'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

import { createAccount, reviewKyc } from './actions'
import * as audit from '@/lib/audit'

const databaseUrl = process.env.DATABASE_URL?.trim()
const explicitlyEnabled = process.env.ACCOUNT_ACTIONS_DATABASE_EXPECTED === '1'

if (explicitlyEnabled) {
  if (!databaseUrl) {
    throw new Error('ACCOUNT_ACTIONS_DATABASE_EXPECTED requires DATABASE_URL')
  }

  const target = new URL(databaseUrl)
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  const isDisposableDatabase = /^\/(?:erp_(?:self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/i.test(
    target.pathname,
  )
  // GitHub's Supabase CLI rebuilds its own loopback database at this exact
  // address; its database name remains `postgres` after the reset.
  const isGitHubSupabaseDatabase =
    process.env.GITHUB_ACTIONS === 'true' &&
    target.hostname === '127.0.0.1' &&
    target.port === '54322' &&
    target.pathname === '/postgres' &&
    target.username === 'postgres'
  if (!isLoopback || (!isDisposableDatabase && !isGitHubSupabaseDatabase)) {
    throw new Error('Account action database tests only accept a loopback disposable test database')
  }
}

const enabled = explicitlyEnabled && databaseUrl !== undefined
const suite = enabled ? describe : describe.skip

function accountForm(name: string): FormData {
  const form = new FormData()
  form.set('name', name)
  return form
}

function kycReviewForm(accountId: string, notes?: string): FormData {
  const form = new FormData()
  form.set('account_id', accountId)
  form.set('decision', 'approved')
  if (notes !== undefined) form.set('notes', notes)
  return form
}

suite('account and KYC actions against disposable PostgreSQL', () => {
  let tenantId: string
  let actorId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tenantId = randomUUID()
    actorId = randomUUID()

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Account Action Integration',
      slug: `account-action-${tenantId}`,
    })
    await db.insert(users).values({
      id: actorId,
      tenant_id: tenantId,
      email: `${actorId}@integration.invalid`,
      full_name: 'Account Action Integration User',
      role: 'admin',
    })

    mocks.requireUserProfile.mockResolvedValue({
      user: { id: actorId },
      tenantId,
      role: 'admin',
      email: `${actorId}@integration.invalid`,
    })
    mocks.can.mockReturnValue(true)
    mocks.redirect.mockImplementation(() => undefined)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  it('commits the account and its audit entry together', async () => {
    const name = `Northstar ${randomUUID()}`
    await createAccount(accountForm(name))

    const rows = await db.select({
      id: accounts.id,
      tenant_id: accounts.tenant_id,
      kyc_status: accounts.kyc_status,
      actor_id: auditLog.actor_id,
      action: auditLog.action,
      diff: auditLog.diff,
    })
      .from(accounts)
      .innerJoin(auditLog, and(
        eq(auditLog.tenant_id, accounts.tenant_id),
        eq(auditLog.entity_type, 'account'),
        eq(auditLog.entity_id, accounts.id),
      ))
      .where(and(eq(accounts.tenant_id, tenantId), eq(accounts.name, name)))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tenant_id: tenantId,
      kyc_status: 'pending',
      actor_id: actorId,
      action: 'create',
      diff: { name, industry: 'other', kyc_status: 'pending' },
    })
    expect(mocks.redirect).toHaveBeenCalledWith(`/crm/accounts/${rows[0]?.id}`)
  })

  it('rolls back account creation when its audit insert fails', async () => {
    vi.spyOn(audit, 'writeAuditLogInTransaction').mockRejectedValueOnce(
      new Error('Simulated audit insert failure'),
    )
    const name = `Rollback ${randomUUID()}`

    await expect(createAccount(accountForm(name))).resolves.toMatchObject({
      error: expect.stringContaining('could not be confirmed'),
    })

    const accountRows = await db.select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenant_id, tenantId), eq(accounts.name, name)))
    const auditRows = await db.select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenant_id, tenantId),
        eq(auditLog.entity_type, 'account'),
      ))
    expect(accountRows).toHaveLength(0)
    expect(auditRows).toHaveLength(0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('persists the KYC decision, preserves omitted notes, and avoids duplicate retry audits', async () => {
    const [account] = await db.insert(accounts).values({
      tenant_id: tenantId,
      name: `KYC ${randomUUID()}`,
      kyc_notes: 'Existing review note',
      created_by: actorId,
    }).returning({ id: accounts.id })
    if (!account) throw new Error('KYC fixture account was not inserted')

    await expect(reviewKyc(kycReviewForm(account.id))).resolves.toEqual({})

    const updated = await db.select({
      kyc_status: accounts.kyc_status,
      kyc_notes: accounts.kyc_notes,
      kyc_decided_by: accounts.kyc_decided_by,
      has_decision_time: sql<boolean>`${accounts.kyc_decided_at} is not null`,
    })
      .from(accounts)
      .where(and(eq(accounts.tenant_id, tenantId), eq(accounts.id, account.id)))
    const initialAudit = await db.select({
      action: auditLog.action,
      diff: auditLog.diff,
    })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenant_id, tenantId),
        eq(auditLog.entity_type, 'account'),
        eq(auditLog.entity_id, account.id),
      ))

    expect(updated).toEqual([{
      kyc_status: 'approved',
      kyc_notes: 'Existing review note',
      kyc_decided_by: actorId,
      has_decision_time: true,
    }])
    expect(initialAudit).toEqual([{
      action: 'approve',
      diff: {
        kyc_status: { before: 'pending', after: 'approved' },
        notes: 'Existing review note',
      },
    }])

    await expect(reviewKyc(kycReviewForm(account.id))).resolves.toEqual({})
    const repeatedAudit = await db.select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenant_id, tenantId),
        eq(auditLog.entity_type, 'account'),
        eq(auditLog.entity_id, account.id),
      ))
    expect(repeatedAudit).toHaveLength(1)
  })

  it('does not review another tenant account or append an audit event', async () => {
    const otherTenantId = randomUUID()
    const otherActorId = randomUUID()
    await db.insert(tenants).values({
      id: otherTenantId,
      name: 'Other Account Tenant',
      slug: `other-${otherTenantId}`,
    })
    await db.insert(users).values({
      id: otherActorId,
      tenant_id: otherTenantId,
      email: `${otherActorId}@integration.invalid`,
      full_name: 'Other Tenant User',
      role: 'admin',
    })
    const [account] = await db.insert(accounts).values({
      tenant_id: otherTenantId,
      name: `Foreign ${randomUUID()}`,
      created_by: otherActorId,
    }).returning({ id: accounts.id })
    if (!account) throw new Error('Cross-tenant fixture account was not inserted')
    const auditBeforeReview = await db.select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenant_id, otherTenantId),
        eq(auditLog.entity_id, account.id),
      ))

    await expect(reviewKyc(kycReviewForm(account.id))).resolves.toEqual({
      error: 'Account not found',
    })

    const unchanged = await db.select({ kyc_status: accounts.kyc_status })
      .from(accounts)
      .where(and(eq(accounts.tenant_id, otherTenantId), eq(accounts.id, account.id)))
    const auditRows = await db.select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenant_id, otherTenantId),
        eq(auditLog.entity_id, account.id),
      ))
    expect(unchanged).toEqual([{ kyc_status: 'pending' }])
    expect(auditRows).toEqual(auditBeforeReview)
  })
})
