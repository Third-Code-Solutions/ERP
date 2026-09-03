'use server'

import {
  createPlatformSupportSessionCommandSchema,
  createPlatformTenantCommandSchema,
  invitePlatformUserCommandSchema,
  updatePlatformTenantStatusCommandSchema,
  updatePlatformTenantCommandSchema,
  updatePlatformUserRoleCommandSchema,
  updatePlatformUserStatusCommandSchema,
} from '@third-code-erp/shared-types/platform-administration'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

import {
  changePlatformTenantStatus,
  changePlatformUserRole,
  changePlatformUserStatus,
  createPlatformTenant,
  endPlatformSupportContext,
  invitePlatformUser,
  resendPlatformInvitation,
  revokePlatformInvitation,
  sendPlatformPasswordReset,
  startPlatformSupportContext,
  updatePlatformTenant,
  PLATFORM_SUPPORT_COOKIE,
  type PlatformResult,
} from '@/lib/platform-admin-client'

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key).trim()
  return value || null
}

function finish(path: string, result: PlatformResult<unknown>, success: string): never {
  revalidatePath('/platform-admin', 'layout')
  const params = new URLSearchParams(
    result.ok ? { notice: success } : { error: result.error }
  )
  redirect(`${path}?${params.toString()}`)
}

function invalid(path: string, message: string): never {
  redirect(`${path}?${new URLSearchParams({ error: message }).toString()}`)
}

export async function createTenantAction(formData: FormData): Promise<never> {
  const parsed = createPlatformTenantCommandSchema.safeParse({
    name: text(formData, 'name'),
    slug: text(formData, 'slug'),
    organizationType: text(formData, 'organizationType'),
    pcabLicense: optionalText(formData, 'pcabLicense'),
    birTin: optionalText(formData, 'birTin'),
    dpoContact: optionalText(formData, 'dpoContact'),
  })
  if (!parsed.success) return invalid('/platform-admin/tenants', 'Check the tenant details and try again.')
  return finish(
    '/platform-admin/tenants',
    await createPlatformTenant(parsed.data),
    'Tenant created.'
  )
}

export async function changeTenantStatusAction(formData: FormData): Promise<never> {
  const tenantId = text(formData, 'tenantId')
  const parsed = updatePlatformTenantStatusCommandSchema.safeParse({
    status: text(formData, 'status'),
    reason: optionalText(formData, 'reason'),
  })
  if (!parsed.success || !tenantId) return invalid('/platform-admin/tenants', 'A valid lifecycle change is required.')
  return finish(
    '/platform-admin/tenants',
    await changePlatformTenantStatus(tenantId, parsed.data),
    'Tenant lifecycle updated.'
  )
}

export async function updateTenantAction(formData: FormData): Promise<never> {
  const tenantId = text(formData, 'tenantId')
  const parsed = updatePlatformTenantCommandSchema.safeParse({
    name: text(formData, 'name'),
    organizationType: text(formData, 'organizationType'),
  })
  if (!parsed.success || !tenantId) return invalid('/platform-admin/tenants', 'Check the tenant configuration and try again.')
  return finish('/platform-admin/tenants', await updatePlatformTenant(tenantId, parsed.data), 'Tenant configuration updated.')
}

export async function inviteUserAction(formData: FormData): Promise<never> {
  const parsed = invitePlatformUserCommandSchema.safeParse({
    tenantId: text(formData, 'tenantId'),
    email: text(formData, 'email'),
    fullName: text(formData, 'fullName'),
    role: text(formData, 'role'),
  })
  if (!parsed.success) return invalid('/platform-admin/users', 'Check the invitation details and try again.')
  return finish(
    '/platform-admin/users',
    await invitePlatformUser(parsed.data),
    'Invitation sent.'
  )
}

export async function changeUserRoleAction(formData: FormData): Promise<never> {
  const userId = text(formData, 'userId')
  const parsed = updatePlatformUserRoleCommandSchema.safeParse({
    role: text(formData, 'role'),
  })
  if (!parsed.success || !userId) return invalid('/platform-admin/users', 'A valid user role is required.')
  return finish(
    '/platform-admin/users',
    await changePlatformUserRole(userId, parsed.data),
    'User role updated.'
  )
}

export async function changeUserStatusAction(formData: FormData): Promise<never> {
  const userId = text(formData, 'userId')
  const parsed = updatePlatformUserStatusCommandSchema.safeParse({
    status: text(formData, 'status'),
    reason: optionalText(formData, 'reason'),
  })
  if (!parsed.success || !userId) return invalid('/platform-admin/users', 'A valid lifecycle change is required.')
  return finish(
    '/platform-admin/users',
    await changePlatformUserStatus(userId, parsed.data),
    'User lifecycle updated.'
  )
}

export async function resendInvitationAction(formData: FormData): Promise<never> {
  return finish(
    '/platform-admin/users',
    await resendPlatformInvitation(text(formData, 'invitationId')),
    'Invitation resent.'
  )
}

export async function revokeInvitationAction(formData: FormData): Promise<never> {
  return finish(
    '/platform-admin/users',
    await revokePlatformInvitation(text(formData, 'invitationId')),
    'Invitation revoked.'
  )
}

export async function sendPasswordResetAction(formData: FormData): Promise<never> {
  return finish(
    '/platform-admin/users',
    await sendPlatformPasswordReset(text(formData, 'userId')),
    'Password reset sent.'
  )
}

export async function startSupportContextAction(formData: FormData): Promise<never> {
  const parsed = createPlatformSupportSessionCommandSchema.safeParse({
    tenantId: text(formData, 'tenantId'),
    reason: text(formData, 'reason'),
    durationMinutes: text(formData, 'durationMinutes'),
  })
  if (!parsed.success) return invalid('/platform-admin/tenants', 'A tenant, reason, and valid duration are required.')
  const result = await startPlatformSupportContext(parsed.data)
  if (result.ok) {
    ;(await cookies()).set(PLATFORM_SUPPORT_COOKIE, result.data.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/platform-admin',
      expires: new Date(result.data.expiresAt),
    })
  }
  return finish(
    '/platform-admin/tenants',
    result,
    'Support context started.'
  )
}

export async function endSupportContextAction(formData: FormData): Promise<never> {
  const result = await endPlatformSupportContext(text(formData, 'sessionId'))
  if (result.ok) {
    ;(await cookies()).set(PLATFORM_SUPPORT_COOKIE, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', path: '/platform-admin', maxAge: 0,
    })
  }
  return finish(
    '/platform-admin',
    result,
    'Support context ended.'
  )
}
