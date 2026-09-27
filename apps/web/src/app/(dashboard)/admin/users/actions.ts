'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  createSupabaseAdminClient,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { users as usersTable } from '@third-code-erp/database/schema'
import {
  stampActorInTransaction,
  writeAuditLog,
  writeAuditLogInTransaction,
} from '@/lib/audit'
import {
  adminUserRoleAssignmentWritesUseCoreApi,
  assignUserRoleThroughCoreApi,
} from '@/lib/erp-core-client'
import { ASSIGNABLE_ROLES, type AssignableRole } from './roles'

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128),
  full_name: z.string().min(2).max(255),
  role: z.enum(ASSIGNABLE_ROLES),
})

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
 * Steps:
 *   1. Supabase Auth admin API creates the auth.users row with the
 *      provided email + password. `email_confirm: true` skips the
 *      verification email so the admin can hand off credentials.
 *   2. INSERT into public.users and its audit entry in one transaction.
 *
 * Deletes the Auth user if the database transaction cannot commit.
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

    const admin = createSupabaseAdminClient()

    // 1) Create the Supabase Auth user.
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name, tenant_id: profile.tenantId },
    })
    if (authErr || !created?.user) {
      return {
        error: authErr?.message ?? 'Could not create the Supabase Auth user.',
      }
    }
    const authUserId = created.user.id

    // 2) Mirror the identity and audit the grant in one database commit.
    try {
      await db.transaction(async (tx) => {
        await stampActorInTransaction(tx, profile.user.id)
        await tx.insert(usersTable).values({
          id: authUserId,
          tenant_id: profile.tenantId,
          email: input.email,
          full_name: input.full_name,
          role: input.role,
        })
        await writeAuditLogInTransaction(tx, {
          tenantId: profile.tenantId,
          actorId: profile.user.id,
          entityType: 'user',
          entityId: authUserId,
          action: 'create',
          diff: { email: input.email, full_name: input.full_name, role: input.role },
        })
      })
    } catch (err) {
      const cleanup = await admin.auth.admin.deleteUser(authUserId).catch((cleanupError: unknown) => ({
        error: cleanupError,
      }))
      console.error('[admin/users:createUser] database transaction failed:', err)
      if (cleanup.error) {
        console.error('[admin/users:createUser] Auth compensation failed:', cleanup.error)
        return { error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.' }
      }
      return {
        error: 'User creation failed before the workspace account was committed.',
      }
    }

    revalidatePath('/admin/users')
    return { userId: authUserId }
  })
}

const updateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  expected_role: z.enum(ASSIGNABLE_ROLES),
  client_request_id: z.string().uuid(),
})

type UpdateUserRoleResult =
  | { ok: true; role: AssignableRole }
  | { ok: false; error: string; outcome: 'rejected' | 'unknown' }

export async function updateUserRole(
  formData: FormData
): Promise<UpdateUserRoleResult> {
  let submitted = false
  try {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { ok: false, error: forbid, outcome: 'rejected' }

    const parsed = updateRoleSchema.safeParse({
      user_id: formData.get('user_id'),
      role: formData.get('role'),
      expected_role: formData.get('expected_role'),
      client_request_id: formData.get('client_request_id'),
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return { ok: false, error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid'}`, outcome: 'rejected' }
    }
    const { user_id, role, expected_role, client_request_id } = parsed.data

    // Disallow self-demotion below admin — protects the workspace from
    // being locked out of admin access.
    if (user_id.toLowerCase() === profile.user.id.toLowerCase() && role !== 'admin' && role !== 'owner') {
      return { ok: false, error: 'You cannot remove your own admin role.', outcome: 'rejected' }
    }

    if (
      user_id.toLowerCase() === profile.user.id.toLowerCase() &&
      profile.role === 'owner' &&
      role !== 'owner'
    ) {
      return { ok: false, error: 'An owner cannot remove their own owner role.', outcome: 'rejected' }
    }

    if (
      profile.role !== 'owner' &&
      role === 'owner'
    ) {
      return { ok: false, error: 'Only an owner can assign or change the owner role.', outcome: 'rejected' }
    }

    if (!adminUserRoleAssignmentWritesUseCoreApi(profile.tenantId)) {
      return { ok: false, error: 'Core role changes are not enabled for this workspace. No role change was submitted.', outcome: 'rejected' }
    }

    // The client keeps this command immutable through uncertain retries. Core
    // rechecks current authority and owns both the role change and atomic audit.
    submitted = true
    const result = await assignUserRoleThroughCoreApi(user_id, { expectedRole: expected_role, role }, client_request_id)
    if (!result.ok) {
      return { ok: false, error: result.error, outcome: result.outcome }
    }
    if (
      result.data.userId.toLowerCase() !== user_id.toLowerCase() ||
      result.data.tenantId.toLowerCase() !== profile.tenantId.toLowerCase() ||
      result.data.role !== role || result.data.previousRole !== expected_role
    ) {
      return { ok: false, error: 'Role change outcome could not be confirmed. Retry the same request.', outcome: 'unknown' }
    }

    revalidatePath('/admin/users')
    revalidatePath(`/admin/users/${user_id}`)
    return { ok: true, role: result.data.role }
  } catch {
    return {
      ok: false,
      error: submitted ? 'Role change outcome could not be confirmed. Retry the same request.' : 'Unable to authorize this role change. Refresh and try again.',
      outcome: submitted ? 'unknown' : 'rejected',
    }
  }
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

const suspendUserSchema = z.object({
  user_id: z.string().uuid().transform((value) => value.toLowerCase()),
  reason: z.string().trim().min(3).max(500).optional().default('Access suspended; retained history preserved.'),
})

async function reconcileSuspensionFromDurableState(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  tenantId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    )
    const [current] = await tx
      .select({ accountStatus: usersTable.account_status })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, tenantId)))
      .limit(1)
      .for('update')
    if (!current) return

    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: current.accountStatus === 'active' ? 'none' : '876000h',
    })
    if (error) throw error
  })
}

/**
 * Suspend a user without deleting retained identity, project, or audit history.
 * The Auth ban is compensated when the database/audit write cannot be confirmed.
 */
export async function suspendUser(
  formData: FormData
): Promise<{ error?: string; ok?: boolean; status?: 'suspended' }> {
  return safe('suspendUser', async () => {
    const profile = await requireUserProfile()
    const forbid = guardAdmin(profile.role)
    if (forbid) return { error: forbid }

    const parsed = suspendUserSchema.safeParse({
      user_id: formData.get('user_id'),
      reason: formData.get('reason') ?? undefined,
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
    }
    const { user_id: userId, reason } = parsed.data

    if (userId === profile.user.id) {
      return { error: 'You cannot suspend your own account.' }
    }
    let admin: ReturnType<typeof createSupabaseAdminClient> | undefined
    let providerAttempted = false
    const missingTargetMessage = 'User not found in this workspace.'
    const lastAdministratorMessage = 'Cannot suspend the last active admin/owner in this workspace.'
    try {
      await db.transaction(async (tx) => {
        // Match Core role/lifecycle writers with a transaction-scoped tenant
        // lock so the administrator guard cannot be bypassed by a race.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${profile.tenantId}, 0))`
        )
        const [target] = await tx
          .select({
            id: usersTable.id,
            email: usersTable.email,
            role: usersTable.role,
            accountStatus: usersTable.account_status,
            activeAdministratorCount: sql<number>`(
              select count(*)::int
              from public.users as active_administrator
              where active_administrator.tenant_id = ${usersTable.tenant_id}
                and active_administrator.account_status = 'active'
                and active_administrator.role in ('admin', 'owner')
                and active_administrator.id <> ${usersTable.id}
            )`,
          })
          .from(usersTable)
          .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, profile.tenantId)))
          .limit(1)
          .for('update')
        if (!target) throw new Error(missingTargetMessage)
        if (target.role === 'owner' && profile.role !== 'owner') {
          throw new Error('Only an owner can suspend another owner.')
        }
        if (
          (target.role === 'admin' || target.role === 'owner')
          && target.accountStatus === 'active'
          && Number(target.activeAdministratorCount) < 1
        ) {
          throw new Error(lastAdministratorMessage)
        }

        admin = createSupabaseAdminClient()
        const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: '876000h',
        })
        providerAttempted = true
        if (authErr) throw new Error(authErr.message)
        await stampActorInTransaction(tx, profile.user.id)
        const [updated] = await tx
          .update(usersTable)
          .set({
            account_status: 'suspended',
            status_reason: reason,
            status_changed_at: new Date(),
            status_changed_by: profile.user.id,
            updated_at: new Date(),
          })
          .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, profile.tenantId)))
          .returning({ id: usersTable.id })
        if (!updated) throw new Error('User changed before suspension was committed')
        await writeAuditLogInTransaction(tx, {
          tenantId: profile.tenantId,
          actorId: profile.user.id,
          entityType: 'user',
          entityId: userId,
          action: 'status_change',
          diff: {
            email: target.email,
            role: target.role,
            from_status: target.accountStatus,
            to_status: 'suspended',
            reason,
          },
        })
      })
    } catch (err) {
      if (err instanceof Error && err.message === lastAdministratorMessage) {
        return { error: err.message }
      }
      if (err instanceof Error && err.message === missingTargetMessage) {
        return { error: err.message }
      }
      if (err instanceof Error && err.message === 'Only an owner can suspend another owner.') {
        return { error: err.message }
      }
      if (providerAttempted) {
        if (admin) {
          await reconcileSuspensionFromDurableState(admin, userId, profile.tenantId).catch(() => undefined)
        }
        console.warn('[admin/users:suspendUser] suspension compensation attempted:', err)
      }
      return { error: 'User suspension could not be confirmed. Retry or reconcile with support.' }
    }

    revalidatePath('/admin/users')
    revalidatePath(`/admin/users/${userId}`)
    return { ok: true, status: 'suspended' }
  })
}

/** @deprecated Use suspendUser. Kept as a safe compatibility alias; it never deletes. */
export async function deleteUser(
  formData: FormData
): Promise<{ error?: string; ok?: boolean; status?: 'suspended' }> {
  return suspendUser(formData)
}
