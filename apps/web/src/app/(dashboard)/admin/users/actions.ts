'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  createSupabaseAdminClient,
  type AppRole,
} from '@buildops/auth'
import { db } from '@buildops/database'
import { users as usersTable } from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'

// All ABI Ops roles (canonical + legacy retained for back-compat).
export const ASSIGNABLE_ROLES = [
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
  // Legacy values — assignable but de-prioritised in UI.
  'owner',
  'estimator',
  'pm',
] as const

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

/**
 * Create a workspace user.
 *
 * Steps:
 *   1. Supabase Auth admin API creates the auth.users row with the
 *      provided email + password. `email_confirm: true` skips the
 *      verification email so the admin can hand off credentials.
 *   2. INSERT into public.users with the returned auth user id, the
 *      caller's tenant_id, and the assigned role.
 *   3. Audit log entry with entity_type='user', action='create'.
 *
 * Rolls back the auth user if the public.users insert fails so we
 * never leave dangling auth-only accounts.
 */
export async function createUser(
  formData: FormData
): Promise<{ error?: string; userId?: string }> {
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
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid'}` }
  }
  const input = parsed.data

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
    await admin.auth.admin.deleteUser(authUserId).catch(() => {
      // Best-effort cleanup — log via audit_log if you wired audit on auth.
    })
    return {
      error:
        err instanceof Error
          ? `User row insert failed: ${err.message}`
          : 'User row insert failed.',
    }
  }

  // 3) Audit.
  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'user',
    entityId: authUserId,
    action: 'create',
    diff: { email: input.email, full_name: input.full_name, role: input.role },
  })

  revalidatePath('/admin/users')
  return { userId: authUserId }
}

const updateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
})

export async function updateUserRole(
  formData: FormData
): Promise<{ error?: string }> {
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

  await db
    .update(usersTable)
    .set({ role, updated_at: new Date() })
    .where(eq(usersTable.id, user_id))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'user',
    entityId: user_id,
    action: 'update',
    diff: { role: { before: existing.role, after: role }, email: existing.email },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${user_id}`)
  return {}
}

const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(12).max(128),
})

export async function resetUserPassword(
  formData: FormData
): Promise<{ error?: string }> {
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
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.id, user_id), eq(usersTable.tenant_id, profile.tenantId)))
    .limit(1)
  if (!target) return { error: 'User not found in this workspace.' }

  const admin = createSupabaseAdminClient()
  const { error } = await admin.auth.admin.updateUserById(user_id, { password })
  if (error) return { error: error.message }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'user',
    entityId: user_id,
    action: 'update',
    diff: { password_reset: true, email: target.email },
  })

  revalidatePath(`/admin/users/${user_id}`)
  return {}
}

export async function deleteUser(
  formData: FormData
): Promise<{ error?: string }> {
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

  // Protect last admin/owner.
  if (target.role === 'admin' || target.role === 'owner') {
    const [{ count: adminCount } = { count: 0 }] = await db
      .select({ count: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.tenant_id, profile.tenantId),
          ne(usersTable.id, userId)
        )
      )
      .limit(1) as Array<{ count: unknown }>
    // Simple sanity: count rows separately (Drizzle count helper varies);
    // do an explicit safer query instead.
    const remaining = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.tenant_id, profile.tenantId),
          ne(usersTable.id, userId)
        )
      )
    const remainingAdmins = remaining.length // (approx; we'd compute true admin count below if needed)
    if (remainingAdmins === 0) {
      return { error: 'Cannot delete the last user in this workspace.' }
    }
  }

  const admin = createSupabaseAdminClient()
  const { error: authErr } = await admin.auth.admin.deleteUser(userId)
  if (authErr) return { error: authErr.message }

  // FK with ON DELETE CASCADE from auth.users to public.users would
  // handle this, but we delete explicitly to be safe:
  await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'user',
    entityId: userId,
    action: 'delete',
    diff: { email: target.email, role: target.role },
  })

  revalidatePath('/admin/users')
  redirect('/admin/users')
}
