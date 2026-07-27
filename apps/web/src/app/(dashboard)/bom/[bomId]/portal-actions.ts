'use server'

import { randomBytes, createHash } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomPortalTokens,
  projects,
  accounts,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyExternalEmail } from '@/lib/operations/notifications'
import { createSigningSession } from '@/lib/operations/integrations/docuseal'

const PORTAL_TOKEN_BYTES = 32
const PORTAL_VALIDITY_HOURS = 48

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

const mintSchema = z.object({
  bom_id: z.string().uuid(),
  client_email: z.string().email('valid client email required'),
})

interface MintResult {
  token?: string
  portal_url?: string
  expires_at?: string
  error?: string
}

/**
 * Mint a one-time portal token for a BOM and email a signing link to the
 * client. Returns the plaintext token ONCE — the caller is responsible for
 * showing/copying it. The DB only ever stores SHA-256(token).
 */
export async function mintBomPortalToken(
  bomId: string,
  clientEmail: string
): Promise<MintResult> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'bom.approve_internal')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.approve_internal"` }
  }

  const parsed = mintSchema.safeParse({ bom_id: bomId, client_email: clientEmail })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Load BOM with project + account context.
  const [row] = await db
    .select({
      bom_id: boms.id,
      bom_status: boms.status,
      project_id: projects.id,
      project_name: projects.name,
      account_name: accounts.name,
    })
    .from(boms)
    .leftJoin(projects, eq(boms.project_id, projects.id))
    .leftJoin(accounts, eq(projects.account_id, accounts.id))
    .where(and(eq(boms.id, input.bom_id), eq(boms.tenant_id, profile.tenantId)))
    .limit(1)
  if (!row) return { error: 'BOM not found' }
  if (row.bom_status === 'archived') {
    return { error: 'Cannot mint a portal token for an archived BOM' }
  }

  // Legacy back-compat: keep the bom_portal_tokens row populated so the
  // existing /portal/bom/[token] flow keeps working for in-flight links.
  // The NEW signing URL comes from createSigningSession (canvas or DocuSeal).
  const legacyToken = randomBytes(PORTAL_TOKEN_BYTES).toString('hex')
  const legacyTokenHash = createHash('sha256').update(legacyToken).digest('hex')
  const expiresAt = new Date(Date.now() + PORTAL_VALIDITY_HOURS * 60 * 60 * 1000)

  let session
  try {
    session = await createSigningSession({
      tenantId: profile.tenantId,
      entityType: 'bom',
      entityId: input.bom_id,
      signerEmail: input.client_email,
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Signing session: ${err.message}`
          : 'Signing session creation failed',
    }
  }

  const [created] = await db
    .insert(bomPortalTokens)
    .values({
      tenant_id: profile.tenantId,
      bom_id: input.bom_id,
      token_hash: legacyTokenHash,
      expires_at: expiresAt,
      docuseal_submission_id:
        session.mechanism === 'docuseal' ? session.token : null,
      docuseal_slug:
        session.mechanism === 'docuseal' ? session.token : null,
    })
    .returning({ id: bomPortalTokens.id })

  // The new signing URL is what the client should actually use. The legacy
  // /portal/bom/[token] route stays available for backwards compatibility.
  const portalUrl = session.url

  await notifyExternalEmail({
    tenantId: profile.tenantId,
    recipientEmail: input.client_email,
    subject: `Your BOM is ready for review — ${row.project_name ?? 'project'}`,
    templateId: 'bom-portal-link',
    templateVars: {
      project_name: row.project_name ?? 'your project',
      portal_url: portalUrl,
      valid_until: expiresAt.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    },
  })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'bom_portal_token',
    entityId: created!.id,
    action: 'create',
    diff: {
      bom_id: input.bom_id,
      client_email: input.client_email,
      expires_at: expiresAt.toISOString(),
      portal_url: portalUrl,
      mechanism: session.mechanism,
      is_dev_stub: session.is_dev_stub,
    },
  })

  return {
    token: session.token,
    portal_url: portalUrl,
    expires_at: expiresAt.toISOString(),
  }
}
