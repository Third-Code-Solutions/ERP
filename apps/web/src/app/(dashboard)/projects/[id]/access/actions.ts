'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  customerPortalSessions,
  projects,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { mintCustomerPortalToken } from '@/lib/operations/customer-portal'

export interface MintAccessResult {
  error?: string
  url?: string
  expiresAt?: string
}

const mintSchema = z.object({
  project_id: z.string().uuid('Project id is required'),
  viewer_email: z
    .string()
    .email('Valid email is required')
    .max(255, 'Email is too long'),
  viewer_name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name is too long'),
  days: z
    .number()
    .int('Must be an integer')
    .min(1, 'Must be at least 1 day')
    .max(3650, 'Cannot exceed 3650 days (10 years)'),
})

function ensureCanManageAccess(role: string): string | null {
  if (role !== 'admin' && role !== 'owner') {
    return `Forbidden: role "${role}" cannot manage customer portal access`
  }
  return null
}

/**
 * Mint a customer portal access link for a project. Returns the plaintext
 * URL exactly ONCE. The caller is responsible for displaying it immediately
 * to the user — the DB only retains SHA-256(token).
 */
export async function mintCustomerPortalAccess(
  formData: FormData
): Promise<MintAccessResult> {
  const profile = await requireUserProfile()
  const guard = ensureCanManageAccess(profile.role)
  if (guard) return { error: guard }

  const daysRaw = formData.get('days')
  const parsed = mintSchema.safeParse({
    project_id: formData.get('project_id'),
    viewer_email: formData.get('viewer_email'),
    viewer_name: formData.get('viewer_name'),
    days: typeof daysRaw === 'string' ? Number(daysRaw) : Number.NaN,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Verify the project belongs to the caller's tenant.
  const [proj] = await db
    .select({ id: projects.id, account_id: projects.account_id })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.project_id),
        eq(projects.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!proj) return { error: 'Project not found' }

  let minted
  try {
    minted = await mintCustomerPortalToken({
      tenantId: profile.tenantId,
      projectId: proj.id,
      accountId: proj.account_id ?? null,
      viewerEmail: input.viewer_email,
      viewerName: input.viewer_name,
      expiresInDays: input.days,
      createdBy: profile.user.id,
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not mint token: ${err.message}`
          : 'Could not mint token',
    }
  }

  // Look up the created row so we can audit by session id.
  const tokenHash = (await import('node:crypto'))
    .createHash('sha256')
    .update(minted.token)
    .digest('hex')
  const [row] = await db
    .select({ id: customerPortalSessions.id })
    .from(customerPortalSessions)
    .where(eq(customerPortalSessions.token_hash, tokenHash))
    .limit(1)

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'customer_portal_session',
    entityId: row?.id ?? proj.id,
    action: 'create',
    diff: {
      project_id: proj.id,
      viewer_email: input.viewer_email,
      viewer_name: input.viewer_name,
      expires_at: minted.expiresAt.toISOString(),
      days: input.days,
    },
  })

  revalidatePath(`/projects/${proj.id}/access`)

  return {
    url: minted.url,
    expiresAt: minted.expiresAt.toISOString(),
  }
}

/**
 * Revoke a customer portal session. Only the tenant that owns the session
 * may revoke it. Sets `revoked_at` to NOW; the row is retained for audit.
 */
export async function revokeCustomerPortalAccess(
  sessionId: string
): Promise<{ error?: string; ok?: true }> {
  const profile = await requireUserProfile()
  const guard = ensureCanManageAccess(profile.role)
  if (guard) return { error: guard }

  if (typeof sessionId !== 'string' || sessionId.length < 8) {
    return { error: 'Invalid session id' }
  }

  // Verify ownership.
  const [row] = await db
    .select({
      id: customerPortalSessions.id,
      project_id: customerPortalSessions.project_id,
      revoked_at: customerPortalSessions.revoked_at,
    })
    .from(customerPortalSessions)
    .where(
      and(
        eq(customerPortalSessions.id, sessionId),
        eq(customerPortalSessions.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!row) return { error: 'Session not found' }
  if (row.revoked_at) {
    // Idempotent — treat as success.
    return { ok: true }
  }

  const now = new Date()
  await db
    .update(customerPortalSessions)
    .set({ revoked_at: now })
    .where(eq(customerPortalSessions.id, sessionId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'customer_portal_session',
    entityId: row.id,
    action: 'delete',
    diff: { revoked_at: now.toISOString() },
  })

  revalidatePath(`/projects/${row.project_id}/access`)

  return { ok: true }
}
