import { z } from 'zod'

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password-validation'

type ProviderError = object | null

export interface PasswordAuthClient {
  signInWithPassword(credentials: {
    email: string
    password: string
  }): Promise<{
    data: { user: { id: string } | null }
    error: ProviderError
  }>
  updateUser(attributes: {
    password: string
    current_password?: string
  }): Promise<{ error: ProviderError }>
  signOut(options: { scope: 'local' }): Promise<{ error: ProviderError }>
}

const authenticatedChangeInputSchema = z.object({
  email: z.string().email(),
  expectedUserId: z.string().min(1),
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH),
})

const recoveryChangeInputSchema = z.object({
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH),
})

export type PasswordOperationResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid_input'
        | 'reauth_failed'
        | 'update_failed'
        | 'cleanup_failed'
        | 'sign_out_failed'
    }

export async function changePasswordWithReauthentication(
  auth: PasswordAuthClient,
  input: {
    email: string
    expectedUserId: string
    currentPassword: string
    newPassword: string
  }
): Promise<PasswordOperationResult> {
  const parsed = authenticatedChangeInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }

  try {
    const { data, error } = await auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.currentPassword,
    })
    if (error || !data.user || data.user.id !== parsed.data.expectedUserId) {
      return { ok: false, reason: 'reauth_failed' }
    }
  } catch {
    return { ok: false, reason: 'reauth_failed' }
  }

  try {
    const { error } = await auth.updateUser({
      password: parsed.data.newPassword,
      current_password: parsed.data.currentPassword,
    })
    if (error) return { ok: false, reason: 'update_failed' }
  } catch {
    return { ok: false, reason: 'update_failed' }
  }

  try {
    const { error } = await auth.signOut({ scope: 'local' })
    if (error) return { ok: false, reason: 'sign_out_failed' }
  } catch {
    return { ok: false, reason: 'sign_out_failed' }
  }

  return { ok: true }
}

export async function completeRecoveryPasswordChange(
  auth: Pick<PasswordAuthClient, 'updateUser' | 'signOut'>,
  input: { newPassword: string },
  clearRecoveryAuthorization: () => Promise<boolean>
): Promise<PasswordOperationResult> {
  const parsed = recoveryChangeInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }

  try {
    const { error } = await auth.updateUser({ password: parsed.data.newPassword })
    if (error) return { ok: false, reason: 'update_failed' }
  } catch {
    return { ok: false, reason: 'update_failed' }
  }

  try {
    if (!(await clearRecoveryAuthorization())) {
      return { ok: false, reason: 'cleanup_failed' }
    }
  } catch {
    return { ok: false, reason: 'cleanup_failed' }
  }

  try {
    const { error } = await auth.signOut({ scope: 'local' })
    if (error) return { ok: false, reason: 'sign_out_failed' }
  } catch {
    return { ok: false, reason: 'sign_out_failed' }
  }

  return { ok: true }
}
