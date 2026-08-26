import { randomUUID } from 'node:crypto'
import { AuthError, requireUser } from '@third-code-erp/auth'
import type { User } from '@supabase/supabase-js'

const OWNER_ADMIN_EMAILS = new Set(['kurt@thirdcodesolutions.com'])

export interface OwnerAdminPrincipal {
  id: string
  email: string
}

export function isOwnerAdminEmail(email: string | null | undefined): boolean {
  return !!email && OWNER_ADMIN_EMAILS.has(email.trim().toLowerCase())
}

export function isOwnerAdminUser(
  user: Pick<User, 'email' | 'email_confirmed_at' | 'confirmed_at'> | null
): boolean {
  return !!user &&
    isOwnerAdminEmail(user.email) &&
    Boolean(user.email_confirmed_at ?? user.confirmed_at)
}

/**
 * Platform authorization is intentionally independent from tenant roles.
 * Do not replace this email allowlist with user metadata or a tenant role:
 * both are caller-controlled or tenant-scoped concepts.
 */
export async function requireOwnerAdmin(): Promise<OwnerAdminPrincipal> {
  const user = await requireUser()
  if (!isOwnerAdminUser(user)) {
    throw new AuthError('FORBIDDEN', 'Owner console access is restricted.')
  }

  return {
    id: user.id,
    email: user.email!.trim().toLowerCase(),
  }
}

export function logPlatformAction(input: {
  action: string
  actorId: string | null
  outcome: 'allowed' | 'rejected' | 'failed'
  traceId?: string
}): string {
  const traceId = input.traceId ?? randomUUID()
  console.info(
    JSON.stringify({
      trace_id: traceId,
      tenant_id: null,
      actor_id: input.actorId,
      action: input.action,
      outcome: input.outcome,
    })
  )
  return traceId
}
