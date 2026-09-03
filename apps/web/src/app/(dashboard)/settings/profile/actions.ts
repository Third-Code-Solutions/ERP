'use server'

import {
  createSupabaseServerClient,
  requireUserProfile,
} from '@third-code-erp/auth'

import { createPasswordVerificationClient } from '@/app/_auth/server-password-client'
import { validateAuthenticatedPasswordChange } from '@/app/_auth/password-validation'
import { writeAuditLog } from '@/lib/audit'

type ChangeOwnPasswordInput = {
  currentPassword: string
  password: string
  confirmation: string
}

export type ChangeOwnPasswordResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid_input'
        | 'reauth_failed'
        | 'audit_failed'
        | 'update_failed'
        | 'sign_out_failed'
    }

export async function changeOwnPassword(
  input: ChangeOwnPasswordInput
): Promise<ChangeOwnPasswordResult> {
  const profile = await requireUserProfile()
  if (validateAuthenticatedPasswordChange(input)) {
    return { ok: false, reason: 'invalid_input' }
  }

  const email = profile.email || profile.user.email
  if (!email) return { ok: false, reason: 'reauth_failed' }

  let verificationClient: ReturnType<typeof createPasswordVerificationClient>
  try {
    verificationClient = createPasswordVerificationClient()
    const { data, error } = await verificationClient.auth.signInWithPassword({
      email,
      password: input.currentPassword,
    })
    if (error || !data.user || data.user.id !== profile.user.id) {
      return { ok: false, reason: 'reauth_failed' }
    }
  } catch {
    return { ok: false, reason: 'reauth_failed' }
  }

  // Persist bounded authorization evidence before the external Auth mutation.
  // If the audit store is unavailable, the password provider is never called.
  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'user_password_change',
      entityId: profile.user.id,
      action: 'update',
      diff: { flow: 'self_service', phase: 'authorized' },
    })
  } catch {
    return { ok: false, reason: 'audit_failed' }
  }

  try {
    const { error } = await verificationClient.auth.updateUser({
      password: input.password,
    })
    if (error) return { ok: false, reason: 'update_failed' }
  } catch {
    return { ok: false, reason: 'update_failed' }
  }

  try {
    const requestClient = await createSupabaseServerClient()
    const { error } = await requestClient.auth.signOut({ scope: 'local' })
    if (error) return { ok: false, reason: 'sign_out_failed' }
  } catch {
    return { ok: false, reason: 'sign_out_failed' }
  }

  return { ok: true }
}
