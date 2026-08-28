'use server'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  createSupabaseAdminClient,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  tenantInvitationIntents,
  users as usersTable,
} from '@third-code-erp/database/schema'
import { writeAuditLog, writeAuditLogInTransaction } from '@/lib/audit'
import {
  adminUserRoleAssignmentWritesUseCoreApi,
  assignUserRoleThroughCoreApi,
} from '@/lib/erp-core-client'
import { ASSIGNABLE_ROLES } from './roles'

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128),
  full_name: z.string().min(2).max(255),
  role: z.enum(ASSIGNABLE_ROLES),
})

const invitationLifetimeMs = 24 * 60 * 60 * 1000

type InvitationAuthority = {
  tenantId: string
  invitedBy: string
  email: string
  role: z.infer<typeof createUserSchema>['role']
}

function createOpaqueInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
  }
}

function hasErrorCode(
  error: unknown,
  code: string
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  )
}

function isDefiniteAuthClientRejection(error: { status?: number } | null): boolean {
  return Boolean(error && error.status && error.status >= 400 && error.status < 500)
}

async function hasPendingInvitation(email: string): Promise<boolean> {
  const [pending] = await db
    .select({ id: tenantInvitationIntents.id })
    .from(tenantInvitationIntents)
    .where(
      and(
        eq(tenantInvitationIntents.invited_email, email),
        isNull(tenantInvitationIntents.consumed_at),
        isNull(tenantInvitationIntents.revoked_at)
      )
    )
    .limit(1)

  return Boolean(pending)
}

async function createInvitationIntent(authority: InvitationAuthority): Promise<{
  id: string
  token: string
}> {
  const { token, tokenHash } = createOpaqueInvitationToken()
  const [intent] = await db
    .insert(tenantInvitationIntents)
    .values({
      tenant_id: authority.tenantId,
      invited_email: authority.email,
      invited_role: authority.role,
      invited_by: authority.invitedBy,
      created_by: authority.invitedBy,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + invitationLifetimeMs),
    })
    .returning({ id: tenantInvitationIntents.id })

  if (!intent) {
    throw new Error('Invitation authority was not persisted.')
  }

  return { id: intent.id, token }
}

async function revokeUnusedInvitationIntent(
  intentId: string,
  authority: Pick<InvitationAuthority, 'tenantId' | 'invitedBy'>
): Promise<void> {
  await db
    .update(tenantInvitationIntents)
    .set({
      revoked_at: new Date(),
      revoked_by: authority.invitedBy,
      revocation_reason: 'auth_create_rejected',
    })
    .where(
      and(
        eq(tenantInvitationIntents.id, intentId),
        eq(tenantInvitationIntents.tenant_id, authority.tenantId),
        isNull(tenantInvitationIntents.consumed_at),
        isNull(tenantInvitationIntents.revoked_at)
      )
    )
}

function guardAdmin(role: AppRole): string | null {
  return can(role, 'admin.users') ? null : `Forbidden: role "${role}" lacks admin.users`
}

/** Wraps an action body so any uncaught throw becomes a returned error
 *  rather than a Vercel "server-side exception" overlay. */
async function safe<T extends { error?: string }>(
  label: string,
  body: () => Promise<T>
): Promise<T> {
  try {
    return await body()
  } catch (err) {

    console.error(`[admin/users:${label}]`, err)
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `${label} failed: ${msg}` } as T
  }
}

/**
 * Create a workspace user.
 *
 * The server first persists a hash-only invitation authority. The Auth trigger
 * then consumes that one-use authority and writes the profile, default
 * membership, and mandatory audit evidence atomically. `email_confirm: true`
 * skips the verification email so the admin can hand off credentials.
 */
export async function createUser(
  formData: FormData
): Promise<{ error?: string; userId?: string }> {
  return safe('createUser', async () => {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { error: forbid }

    const parsed = createUserSchema.safeParse({
      email: String(formData.get('email') ?? '').trim().toLowerCase(),
      password: String(formData.get('password') ?? ''),
      full_name: String(formData.get('full_name') ?? '').trim(),
      role: String(formData.get('role') ?? 'viewer'),
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return {
        error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
      }
    }
    const input = parsed.data
    if (input.role === 'owner' && profile.role !== 'owner') {
      return { error: 'Only an owner can create another owner.' }
    }

    // Reject duplicate emails within this tenant (Supabase Auth rejects
    // globally too, but we want a clean error before hitting the admin API).
    const [existingInTenant] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.tenant_id, profile.tenantId), eq(usersTable.email, input.email))
      )
      .limit(1)
    if (existingInTenant) {
      return { error: 'A user with this email already exists in this workspace.' }
    }

    const authority: InvitationAuthority = {
      tenantId: profile.tenantId,
      invitedBy: profile.user.id,
      email: input.email,
      role: input.role,
    }
    if (await hasPendingInvitation(authority.email)) {
      return {
        error:
          'An invitation for this email is already pending. Do not retry until it is reviewed.',
      }
    }

    let invitation: { id: string; token: string }
    try {
      invitation = await createInvitationIntent(authority)
    } catch (error) {
      if (hasErrorCode(error, '23505')) {
        return {
          error:
            'An invitation for this email is already pending. Do not retry until it is reviewed.',
        }
      }
      throw error
    }

    const admin = createSupabaseAdminClient()
    let created: { user: { id: string } | null } | null = null
    let authErr: { message: string; status?: number } | null = null
    try {
      const result = await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          provisioning_mode: 'tenant_invitation_v1',
          tenant_invitation_token_v1: invitation.token,
          full_name: input.full_name,
        },
      })
      created = result.data
      authErr = result.error
    } catch {
      // A transport failure has an unknown remote outcome. Keep the only
      // usable intent intact rather than issuing another capability.
      return {
        error:
          'Invitation creation outcome is unknown. Do not retry until the pending invitation is reviewed.',
      }
    }

    if (authErr || !created?.user) {
      if (isDefiniteAuthClientRejection(authErr)) {
        try {
          await revokeUnusedInvitationIntent(invitation.id, authority)
        } catch {
          return {
            error:
              'The Auth account was rejected, but the pending invitation could not be revoked. Review it before retrying.',
          }
        }
      }
      return {
        error:
          authErr?.message ??
          'Invitation creation outcome is unknown. Do not retry until the pending invitation is reviewed.',
      }
    }
    revalidatePath('/admin/users')
    return { userId: created.user.id }
  })
}

const updateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
})

export async function updateUserRole(
  formData: FormData
): Promise<{ error?: string }> {
  return safe('updateUserRole', async () => {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { error: forbid }

    const parsed = updateRoleSchema.safeParse({
      user_id: formData.get('user_id'),
      role: formData.get('role'),
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid'}` }
    }
    const { user_id, role } = parsed.data

    // Disallow self-demotion below admin — protects the workspace from
    // being locked out of admin access.
    if (user_id === profile.user.id && role !== 'admin' && role !== 'owner') {
      return { error: 'You cannot remove your own admin role.' }
    }

    const [existing] = await db
      .select({ id: usersTable.id, role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.id, user_id), eq(usersTable.tenant_id, profile.tenantId)))
      .limit(1)
    if (!existing) return { error: 'User not found in this workspace.' }
    if (existing.role === role) return {}

    if (
      user_id === profile.user.id &&
      existing.role === 'owner' &&
      role !== 'owner'
    ) {
      return { error: 'An owner cannot remove their own owner role.' }
    }

    if (
      profile.role !== 'owner' &&
      (existing.role === 'owner' || role === 'owner')
    ) {
      return { error: 'Only an owner can assign or change the owner role.' }
    }

    if (adminUserRoleAssignmentWritesUseCoreApi(profile.tenantId)) {
      const result = await assignUserRoleThroughCoreApi(
        user_id,
        { expectedRole: existing.role, role },
        randomUUID()
      )
      if (!result.ok || !result.data) {
        return {
          error: result.error ?? 'User role assignment was not committed.',
        }
      }
      if (
        result.data.userId !== user_id ||
        result.data.tenantId !== profile.tenantId ||
        result.data.role !== role
      ) {
        return { error: 'User role assignment returned an invalid tenant scope.' }
      }

      revalidatePath('/admin/users')
      revalidatePath(`/admin/users/${user_id}`)
      return {}
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ role, updated_at: new Date() })
        .where(
          and(
            eq(usersTable.id, user_id),
            eq(usersTable.tenant_id, profile.tenantId)
          )
        )

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'user',
        entityId: user_id,
        action: 'update',
        diff: { role: { before: existing.role, after: role }, email: existing.email },
      })
    })

    revalidatePath('/admin/users')
    revalidatePath(`/admin/users/${user_id}`)
    return {}
  })
}

const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(12).max(128),
})

export async function resetUserPassword(
  formData: FormData
): Promise<{ error?: string }> {
  return safe('resetUserPassword', async () => {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { error: forbid }

    const parsed = resetPasswordSchema.safeParse({
      user_id: formData.get('user_id'),
      password: formData.get('password'),
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid'}` }
    }
    const { user_id, password } = parsed.data

    // Tenant-scope guard.
    const [target] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(and(eq(usersTable.id, user_id), eq(usersTable.tenant_id, profile.tenantId)))
      .limit(1)
    if (!target) return { error: 'User not found in this workspace.' }
    if (target.role === 'owner' && profile.role !== 'owner') {
      return { error: 'Only an owner can reset another owner password.' }
    }

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return { error: error.message }

    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'user',
        entityId: user_id,
        action: 'update',
        diff: { password_reset: true, email: target.email },
      })
    } catch (err) {

      console.warn('[admin/users:resetUserPassword] audit log failed:', err)
    }

    revalidatePath(`/admin/users/${user_id}`)
    return {}
  })
}

/**
 * Delete a user. Returns `{ ok: true }` on success so the client can
 * navigate — we DO NOT `redirect()` here because the form action runs
 * inside `useTransition` and a thrown redirect inside a transition is
 * fragile across Next versions. Client-side `router.push` is safer.
 */
export async function deleteUser(
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  return safe('deleteUser', async () => {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { error: forbid }

    const userId = String(formData.get('user_id') ?? '')
    if (!userId) return { error: 'user_id required' }

    if (userId === profile.user.id) {
      return { error: 'You cannot delete your own account.' }
    }

    const [target] = await db
      .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, profile.tenantId)))
      .limit(1)
    if (!target) return { error: 'User not found in this workspace.' }
    if (target.role === 'owner' && profile.role !== 'owner') {
      return { error: 'Only an owner can delete another owner.' }
    }

    // Protect the last admin/owner — count the remaining admins/owners
    // in this tenant (excluding the target).
    if (target.role === 'admin' || target.role === 'owner') {
      const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.tenant_id, profile.tenantId),
            ne(usersTable.id, userId),
            // role IN ('admin', 'owner')
            sql`${usersTable.role} IN ('admin', 'owner')`
          )
        )
      if (!count || count < 1) {
        return { error: 'Cannot delete the last admin/owner in this workspace.' }
      }
    }

    const admin = createSupabaseAdminClient()
    const { error: authErr } = await admin.auth.admin.deleteUser(userId)
    if (authErr) return { error: authErr.message }

    // FK from public.users.id → auth.users.id is ON DELETE CASCADE in
    // Supabase by default, so the row often goes with it. We delete
    // explicitly to be safe (idempotent).
    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, profile.tenantId)))

    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'user',
        entityId: userId,
        action: 'delete',
        diff: { email: target.email, role: target.role },
      })
    } catch (err) {

      console.warn('[admin/users:deleteUser] audit log failed:', err)
    }

    revalidatePath('/admin/users')
    return { ok: true }
  })
}
