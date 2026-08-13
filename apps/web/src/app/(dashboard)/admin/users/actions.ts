'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, ne, sql } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  createSupabaseAdminClient,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { users as usersTable } from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
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
    // eslint-disable-next-line no-console
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
 *   2. INSERT into public.users with the returned auth user id, the
 *      caller's tenant_id, and the assigned role.
 *   3. Audit log entry (best-effort — failure does not roll back).
 *
 * Rolls back the auth user if the public.users insert fails so we
 * never leave dangling auth-only accounts.
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

    // 2) Mirror into public.users. If this fails we delete the auth user.
    try {
      await db.insert(usersTable).values({
        id: authUserId,
        tenant_id: profile.tenantId,
        email: input.email,
        full_name: input.full_name,
        role: input.role,
      })
    } catch (err) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {})
      return {
        error:
          err instanceof Error
            ? `User row insert failed: ${err.message}`
            : 'User row insert failed.',
      }
    }

    // 3) Audit — best-effort. A broken audit chain must not break
    // user creation, so we log and continue.
    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'user',
        entityId: authUserId,
        action: 'create',
        diff: { email: input.email, full_name: input.full_name, role: input.role },
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[admin/users:createUser] audit log insert failed (non-fatal):', err)
    }

    revalidatePath('/admin/users')
    return { userId: authUserId }
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

    await db
      .update(usersTable)
      .set({ role, updated_at: new Date() })
      .where(
        and(
          eq(usersTable.id, user_id),
          eq(usersTable.tenant_id, profile.tenantId)
        )
      )

    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'user',
        entityId: user_id,
        action: 'update',
        diff: { role: { before: existing.role, after: role }, email: existing.email },
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[admin/users:updateUserRole] audit log failed:', err)
    }

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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.warn('[admin/users:deleteUser] audit log failed:', err)
    }

    revalidatePath('/admin/users')
    return { ok: true }
  })
}
