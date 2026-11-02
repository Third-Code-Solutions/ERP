import 'server-only'

import {
  createPlatformSupportSessionCommandSchema, createPlatformTenantCommandSchema,
  invitePlatformUserCommandSchema, updatePlatformTenantStatusCommandSchema,
  updatePlatformTenantCommandSchema, updatePlatformUserRoleCommandSchema,
  updatePlatformUserStatusCommandSchema,
} from '@third-code-erp/shared-types/platform-administration'
import { cookies } from 'next/headers'

import {
  changePlatformTenantStatus, changePlatformUserRole, changePlatformUserStatus,
  createPlatformTenant, endPlatformSupportContext, invitePlatformUser,
  resendPlatformInvitation, revokePlatformInvitation, sendPlatformPasswordReset,
  startPlatformSupportContext, updatePlatformTenant, PLATFORM_SUPPORT_COOKIE,
  type PlatformResult,
} from '@/lib/platform-admin-client'
import type { NativeFormDestination } from '@/lib/native-form-request'

export type PlatformCommandOutcome = { destination: NativeFormDestination } &
  ({ notice: string } | { error: string })

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function optionalText(formData: FormData, key: string): string | null {
  return text(formData, key).trim() || null
}

function finish(destination: NativeFormDestination, result: PlatformResult<unknown>, success: string): PlatformCommandOutcome {
  return result.ok ? { destination, notice: success } : { destination, error: result.error }
}

function invalid(destination: NativeFormDestination, error: string): PlatformCommandOutcome {
  return { destination, error }
}

async function createTenant(formData: FormData): Promise<PlatformCommandOutcome> {
  const parsed = createPlatformTenantCommandSchema.safeParse({
    name: text(formData, 'name'), slug: text(formData, 'slug'), organizationType: text(formData, 'organizationType'),
    pcabLicense: optionalText(formData, 'pcabLicense'), birTin: optionalText(formData, 'birTin'), dpoContact: optionalText(formData, 'dpoContact'),
  })
  if (!parsed.success) return invalid('/platform-admin/tenants', 'Check the tenant details and try again.')
  return finish('/platform-admin/tenants', await createPlatformTenant(parsed.data), 'Tenant created.')
}

async function changeTenantStatus(formData: FormData): Promise<PlatformCommandOutcome> {
  const tenantId = text(formData, 'tenantId')
  const parsed = updatePlatformTenantStatusCommandSchema.safeParse({ status: text(formData, 'status'), reason: optionalText(formData, 'reason') })
  if (!parsed.success || !tenantId) return invalid('/platform-admin/tenants', 'A valid lifecycle change is required.')
  return finish('/platform-admin/tenants', await changePlatformTenantStatus(tenantId, parsed.data), 'Tenant lifecycle updated.')
}

async function updateTenant(formData: FormData): Promise<PlatformCommandOutcome> {
  const tenantId = text(formData, 'tenantId')
  const parsed = updatePlatformTenantCommandSchema.safeParse({ name: text(formData, 'name'), organizationType: text(formData, 'organizationType') })
  if (!parsed.success || !tenantId) return invalid('/platform-admin/tenants', 'Check the tenant configuration and try again.')
  return finish('/platform-admin/tenants', await updatePlatformTenant(tenantId, parsed.data), 'Tenant configuration updated.')
}

async function inviteUser(formData: FormData): Promise<PlatformCommandOutcome> {
  const parsed = invitePlatformUserCommandSchema.safeParse({ tenantId: text(formData, 'tenantId'), email: text(formData, 'email'), fullName: text(formData, 'fullName'), role: text(formData, 'role') })
  if (!parsed.success) return invalid('/platform-admin/users', 'Check the invitation details and try again.')
  return finish('/platform-admin/users', await invitePlatformUser(parsed.data), 'Invitation sent.')
}

async function changeUserRole(formData: FormData): Promise<PlatformCommandOutcome> {
  const userId = text(formData, 'userId')
  const parsed = updatePlatformUserRoleCommandSchema.safeParse({ role: text(formData, 'role') })
  if (!parsed.success || !userId) return invalid('/platform-admin/users', 'A valid user role is required.')
  return finish('/platform-admin/users', await changePlatformUserRole(userId, parsed.data), 'User role updated.')
}

async function changeUserStatus(formData: FormData): Promise<PlatformCommandOutcome> {
  const userId = text(formData, 'userId')
  const parsed = updatePlatformUserStatusCommandSchema.safeParse({ status: text(formData, 'status'), reason: optionalText(formData, 'reason') })
  if (!parsed.success || !userId) return invalid('/platform-admin/users', 'A valid lifecycle change is required.')
  return finish('/platform-admin/users', await changePlatformUserStatus(userId, parsed.data), 'User lifecycle updated.')
}

async function startSupport(formData: FormData): Promise<PlatformCommandOutcome> {
  const parsed = createPlatformSupportSessionCommandSchema.safeParse({ tenantId: text(formData, 'tenantId'), reason: text(formData, 'reason'), durationMinutes: text(formData, 'durationMinutes') })
  if (!parsed.success) return invalid('/platform-admin/tenants', 'A tenant, reason, and valid duration are required.')
  const result = await startPlatformSupportContext(parsed.data)
  if (result.ok) {
    ;(await cookies()).set(PLATFORM_SUPPORT_COOKIE, result.data.id, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/platform-admin', expires: new Date(result.data.expiresAt),
    })
  }
  return finish('/platform-admin/tenants', result, 'Support context started.')
}

async function endSupport(formData: FormData): Promise<PlatformCommandOutcome> {
  const result = await endPlatformSupportContext(text(formData, 'sessionId'))
  if (result.ok) {
    ;(await cookies()).set(PLATFORM_SUPPORT_COOKIE, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/platform-admin', maxAge: 0,
    })
  }
  return finish('/platform-admin', result, 'Support context ended.')
}

export async function dispatchPlatformAdminCommand(formData: FormData): Promise<PlatformCommandOutcome | null> {
  switch (text(formData, 'operation')) {
    case 'create-tenant': return createTenant(formData)
    case 'change-tenant-status': return changeTenantStatus(formData)
    case 'update-tenant': return updateTenant(formData)
    case 'invite-user': return inviteUser(formData)
    case 'change-user-role': return changeUserRole(formData)
    case 'change-user-status': return changeUserStatus(formData)
    case 'resend-invitation': return finish('/platform-admin/users', await resendPlatformInvitation(text(formData, 'invitationId')), 'Invitation resent.')
    case 'revoke-invitation': return finish('/platform-admin/users', await revokePlatformInvitation(text(formData, 'invitationId')), 'Invitation revoked.')
    case 'send-password-reset': return finish('/platform-admin/users', await sendPlatformPasswordReset(text(formData, 'userId')), 'Password reset sent.')
    case 'start-support': return startSupport(formData)
    case 'end-support': return endSupport(formData)
    default: return null
  }
}
