/**
 * In-app canvas signing — DocuSeal alternative.
 *
 * Generates a hashed one-time token, inserts a `signature_sessions` row,
 * returns the plaintext token (ONCE) so a caller can build the public
 * signing URL `${SITE}/portal/sign/${token}`.
 *
 * On submit, the public action stores the canvas PNG to Supabase
 * Storage, links it via `signature_document_id`, stamps `signed_at`,
 * and updates the source entity (BOM / Contract / VO / COC).
 *
 * Why not DocuSeal: zero env vars, zero external service, immediate.
 * Legally adequate for the PH contractor signing volume under RA 8792.
 * The DocuSeal client (apps/web/src/lib/operations/integrations/docuseal.ts)
 * stays in the repo and is used instead when DOCUSEAL_API_URL is set.
 */

import crypto from 'node:crypto'
import { db } from '@third-code-erp/database'
import { signatureSessions } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'

export type SignableEntityType = 'bom' | 'contract' | 'variation_order' | 'coc'

interface CreateSignSessionInput {
  tenantId: string
  entityType: SignableEntityType
  entityId: string
  /** Hours until the link expires. Default 48 (matches REFACTOR §6.3). */
  expiresInHours?: number
  signerEmail?: string
  signerName?: string
}

interface SignSessionResult {
  token: string // plaintext — return to caller ONCE
  url: string // public URL (relative)
  expires_at: Date
}

/** Default to localhost in dev; live deploys override via env. */
function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createCanvasSignSession(
  input: CreateSignSessionInput
): Promise<SignSessionResult> {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(
    Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000
  )

  await db.insert(signatureSessions).values({
    tenant_id: input.tenantId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    signer_email: input.signerEmail,
    signer_name: input.signerName,
  })

  return {
    token,
    url: `${siteUrl()}/portal/sign/${token}`,
    expires_at: expiresAt,
  }
}

/**
 * Look up a session by URL token. Returns the row (admin scope —
 * caller is the public portal action with no user context, so we read
 * with the admin client). The token is SHA-256-hashed before the query
 * so the plaintext never touches the DB.
 */
export async function findSignSession(token: string) {
  const tokenHash = hashToken(token)
  const [row] = await db
    .select()
    .from(signatureSessions)
    .where(eq(signatureSessions.token_hash, tokenHash))
    .limit(1)
  return row ?? null
}

export function isExpired(row: { expires_at: Date | string; signed_at: Date | string | null; revoked_at: Date | string | null }): boolean {
  if (row.revoked_at) return true
  const expiresAt =
    row.expires_at instanceof Date
      ? row.expires_at
      : new Date(row.expires_at)
  return expiresAt.getTime() < Date.now()
}

export function isSigned(row: { signed_at: Date | string | null }): boolean {
  return row.signed_at !== null && row.signed_at !== undefined
}
