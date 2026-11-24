import { createHash } from 'node:crypto'
import { db } from '@third-code-erp/database'
import {
  bomPortalTokens,
  cnpsSurveys,
  customerPortalSessions,
  signatureSessions,
  tenants,
  vendorConfirmationSessions,
  warrantyPortalTokens,
} from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * The shared portal layout cannot see the page's route params, so it resolves
 * the issuing company from the request path: /portal/<kind>/<token>. The tenant
 * comes from the token record itself (never from the URL), via the same hashed
 * token lookup each portal page performs.
 */
interface TokenSource {
  table: PgTable
  tenantId: AnyPgColumn
  tokenHash: AnyPgColumn
}

const TOKEN_SOURCES = {
  bom: {
    table: bomPortalTokens,
    tenantId: bomPortalTokens.tenant_id,
    tokenHash: bomPortalTokens.token_hash,
  },
  cnps: {
    table: cnpsSurveys,
    tenantId: cnpsSurveys.tenant_id,
    tokenHash: cnpsSurveys.response_token_hash,
  },
  project: {
    table: customerPortalSessions,
    tenantId: customerPortalSessions.tenant_id,
    tokenHash: customerPortalSessions.token_hash,
  },
  'purchase-order': {
    table: vendorConfirmationSessions,
    tenantId: vendorConfirmationSessions.tenant_id,
    tokenHash: vendorConfirmationSessions.token_hash,
  },
  sign: {
    table: signatureSessions,
    tenantId: signatureSessions.tenant_id,
    tokenHash: signatureSessions.token_hash,
  },
  warranty: {
    table: warrantyPortalTokens,
    tenantId: warrantyPortalTokens.tenant_id,
    tokenHash: warrantyPortalTokens.token_hash,
  },
} satisfies Record<string, TokenSource>

type PortalKind = keyof typeof TOKEN_SOURCES

const PORTAL_PATH = /^\/portal\/([a-z-]+)\/([^/?#]+)/

function isPortalKind(value: string): value is PortalKind {
  return Object.prototype.hasOwnProperty.call(TOKEN_SOURCES, value)
}

export function parsePortalPath(
  pathname: string | null | undefined
): { kind: PortalKind; token: string } | null {
  const match = pathname ? PORTAL_PATH.exec(pathname) : null
  const kind = match?.[1]
  const token = match?.[2]
  if (!kind || !token || !isPortalKind(kind)) return null
  return { kind, token }
}

/** Company name of the tenant that owns the token in `pathname`, or null when unknown. */
export async function resolvePortalCompanyName(
  pathname: string | null | undefined
): Promise<string | null> {
  const parsed = parsePortalPath(pathname)
  if (!parsed) return null
  const source: TokenSource = TOKEN_SOURCES[parsed.kind]
  const tokenHash = createHash('sha256').update(parsed.token).digest('hex')

  try {
    const [row] = await db
      .select({ name: tenants.name })
      .from(source.table)
      .innerJoin(tenants, eq(tenants.id, source.tenantId))
      .where(eq(source.tokenHash, tokenHash))
      .limit(1)
    return row?.name ?? null
  } catch (error) {
    // Branding must not take the portal down; the layout falls back to a neutral name.
    console.error(
      JSON.stringify({
        event: 'portal_company_name_lookup_failed',
        kind: parsed.kind,
        error: error instanceof Error ? error.message : 'unknown',
      })
    )
    return null
  }
}
