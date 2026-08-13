/**
 * Customer portal token helpers (REFACTOR.md Phase 10 — Customer Portal).
 *
 * Long-lived (default 365 days) read-only tokens that let a client open a
 * live project dashboard without a workspace login. Distinct from
 * `/portal/sign` (short-lived, one-shot signing) and `/portal/warranty`
 * (one-link-per-project, ticket submission only).
 *
 * Pattern mirrors `apps/web/src/lib/operations/integrations/canvas-sign.ts`:
 *   - Generate plaintext token, SHA-256 hash, store hash only.
 *   - Plaintext is returned to the caller exactly once.
 *   - `findActiveCustomerSession` walks the row + computes expiry/revocation.
 *   - `logCustomerView` increments `view_count` and stamps `last_viewed_at`.
 *
 * No user auth context — these helpers are invoked from public Server
 * Components, so they use the shared Drizzle client. Tenant identity is
 * always derived from the session row, never from URL or form input.
 */

import crypto from 'node:crypto'
import { db } from '@third-code-erp/database'
import { customerPortalSessions } from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'

/** Return value of mintCustomerPortalToken — plaintext shown once. */
interface MintCustomerPortalTokenResult {
  token: string
  url: string
  expiresAt: Date
}

interface MintCustomerPortalTokenInput {
  tenantId: string
  projectId: string
  accountId?: string | null
  viewerEmail?: string
  viewerName?: string
  /** Days until the link expires. Default 365. */
  expiresInDays?: number
  createdBy: string
}

const DEFAULT_EXPIRES_IN_DAYS = 365

/** Compute the SHA-256 hex digest of the URL token. */
export function hashCustomerPortalToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Resolved site URL — env override → Vercel → localhost fallback. */
function siteBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

/** Row shape returned by findActiveCustomerSession. */
export type ActiveCustomerSession = typeof customerPortalSessions.$inferSelect

/**
 * Look up a session by the URL token. Hashes plaintext, queries the row,
 * and returns it only when not revoked and not expired. Returns null
 * otherwise so the caller can render an "expired" dead end.
 */
export async function findActiveCustomerSession(
  token: string
): Promise<ActiveCustomerSession | null> {
  if (!token || typeof token !== 'string') return null
  const tokenHash = hashCustomerPortalToken(token)

  const [row] = await db
    .select()
    .from(customerPortalSessions)
    .where(eq(customerPortalSessions.token_hash, tokenHash))
    .limit(1)

  if (!row) return null
  if (row.revoked_at) return null

  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)
  if (expiresAt.getTime() < Date.now()) return null

  return row
}

/**
 * Record a portal view. Best-effort — never throws. The client-facing page
 * still renders even if the increment fails (e.g. transient DB blip).
 */
export async function logCustomerView(
  sessionId: string,
  tenantId: string
): Promise<void> {
  if (!sessionId || !tenantId) return
  try {
    await db
      .update(customerPortalSessions)
      .set({
        last_viewed_at: new Date(),
        view_count: sql`${customerPortalSessions.view_count} + 1`,
      })
      .where(
        and(
          eq(customerPortalSessions.id, sessionId),
          eq(customerPortalSessions.tenant_id, tenantId)
        )
      )
  } catch {
    // Swallow — view counters are diagnostic, not load-bearing.
  }
}

/**
 * Mint a new customer-portal token. Returns the plaintext token + full URL
 * EXACTLY ONCE; only the SHA-256 hash is persisted. The caller (admin UI)
 * is responsible for surfacing the URL to the user with a "shown once"
 * affordance — once the response is discarded, the token cannot be
 * recovered.
 */
export async function mintCustomerPortalToken(
  input: MintCustomerPortalTokenInput
): Promise<MintCustomerPortalTokenResult> {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashCustomerPortalToken(token)
  const days = input.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  await db.insert(customerPortalSessions).values({
    tenant_id: input.tenantId,
    project_id: input.projectId,
    account_id: input.accountId ?? null,
    viewer_email: input.viewerEmail ?? null,
    viewer_name: input.viewerName ?? null,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: input.createdBy,
  })

  return {
    token,
    url: `${siteBase()}/portal/project/${token}`,
    expiresAt,
  }
}
