'use server'

import { createHash } from 'crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@buildops/database'
import {
  bomPortalTokens,
  boms,
  bomLineItems,
  projects,
  accounts,
} from '@buildops/database/schema'
import { notifyRoles } from '@/lib/abi/notifications'
import { writeAuditLog } from '@/lib/audit'

interface SignResult {
  ok?: true
  error?: string
}

/**
 * Mark a portal token as used (signed) and lock the BOM. Public action —
 * the only auth is possession of the URL token, which we re-hash + look up.
 */
export async function recordSign(token: string): Promise<SignResult> {
  if (typeof token !== 'string' || token.length < 16) {
    return { error: 'Invalid token' }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const [row] = await db
    .select({
      id: bomPortalTokens.id,
      tenant_id: bomPortalTokens.tenant_id,
      bom_id: bomPortalTokens.bom_id,
      expires_at: bomPortalTokens.expires_at,
      used_at: bomPortalTokens.used_at,
    })
    .from(bomPortalTokens)
    .where(eq(bomPortalTokens.token_hash, tokenHash))
    .limit(1)
  if (!row) return { error: 'Token not found' }
  if (row.used_at) return { error: 'This BOM has already been signed' }
  if (row.expires_at.getTime() < Date.now()) {
    return { error: 'This portal link has expired' }
  }

  const now = new Date()
  await db
    .update(bomPortalTokens)
    .set({ used_at: now })
    .where(eq(bomPortalTokens.id, row.id))

  // Lock the BOM.
  await db
    .update(boms)
    .set({ status: 'locked', locked_at: now, updated_at: now })
    .where(and(eq(boms.id, row.bom_id), eq(boms.tenant_id, row.tenant_id)))

  // Pull project + tcv for the notification body.
  const [ctx] = await db
    .select({
      tcv_cents: boms.tcv_cents,
      project_id: projects.id,
      project_name: projects.name,
    })
    .from(boms)
    .leftJoin(projects, eq(boms.project_id, projects.id))
    .where(eq(boms.id, row.bom_id))
    .limit(1)

  const tcvPhp = ctx?.tcv_cents
    ? (ctx.tcv_cents / 100).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  await notifyRoles({
    tenantId: row.tenant_id,
    recipientRoles: ['sales', 'commercial', 'admin', 'owner'],
    subject: `Client signed BOM — ${ctx?.project_name ?? 'project'}`,
    body: `The client has signed the BOM. TCV: ₱${tcvPhp}.`,
    linkUrl: ctx?.project_id ? `/projects/${ctx.project_id}/bom` : '/bom',
    alsoEmail: true,
    templateId: 'bom-signed',
    templateVars: {
      project_name: ctx?.project_name ?? 'your project',
      tcv_php: tcvPhp,
      project_url: ctx?.project_id ? `/projects/${ctx.project_id}` : '/bom',
    },
  })

  await writeAuditLog({
    tenantId: row.tenant_id,
    // No internal actor — use bom_id as anchor.
    actorId: row.bom_id,
    entityType: 'bom',
    entityId: row.bom_id,
    action: 'lock',
    diff: { source: 'client_portal_sign', signed_at: now.toISOString() },
  })

  return { ok: true }
}

interface PortalBomLine {
  id: string
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_cents: number
  line_total_cents: number
  category: string
}

interface PortalBomDetail {
  state:
    | 'ok'
    | 'expired'
    | 'used'
    | 'not_found'
  bom?: {
    id: string
    label: string | null
    status: string
    version: number
    tcv_cents: number
    total_cost_cents: number
    project_name: string
    account_name: string | null
    valid_until: string
    docuseal_slug: string | null
    is_dev_stub: boolean
    lines: PortalBomLine[]
  }
}

/**
 * Resolve a portal token to a renderable BOM payload. Public — never
 * trusts URL params for tenant scope, resolves tenant_id from the token row.
 */
export async function loadPortalBom(token: string): Promise<PortalBomDetail> {
  if (typeof token !== 'string' || token.length < 16) {
    return { state: 'not_found' }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [row] = await db
    .select({
      id: bomPortalTokens.id,
      tenant_id: bomPortalTokens.tenant_id,
      bom_id: bomPortalTokens.bom_id,
      expires_at: bomPortalTokens.expires_at,
      used_at: bomPortalTokens.used_at,
      docuseal_slug: bomPortalTokens.docuseal_slug,
      docuseal_submission_id: bomPortalTokens.docuseal_submission_id,
    })
    .from(bomPortalTokens)
    .where(eq(bomPortalTokens.token_hash, tokenHash))
    .limit(1)

  if (!row) return { state: 'not_found' }
  if (row.used_at) return { state: 'used' }
  if (row.expires_at.getTime() < Date.now()) return { state: 'expired' }

  const [bomRow] = await db
    .select({
      id: boms.id,
      label: boms.label,
      status: boms.status,
      version: boms.version,
      tcv_cents: boms.tcv_cents,
      total_cost_cents: boms.total_cost_cents,
      project_name: projects.name,
      account_name: accounts.name,
    })
    .from(boms)
    .leftJoin(projects, eq(boms.project_id, projects.id))
    .leftJoin(accounts, eq(projects.account_id, accounts.id))
    .where(
      and(eq(boms.id, row.bom_id), eq(boms.tenant_id, row.tenant_id))
    )
    .limit(1)
  if (!bomRow) return { state: 'not_found' }

  const lines = await db
    .select({
      id: bomLineItems.id,
      code: bomLineItems.code,
      description: bomLineItems.description,
      unit: bomLineItems.unit,
      quantity: bomLineItems.quantity,
      unit_cost_cents: bomLineItems.unit_cost_cents,
      line_total_cents: bomLineItems.line_total_cents,
      is_group: bomLineItems.is_group,
    })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.bom_id, row.bom_id),
        eq(bomLineItems.tenant_id, row.tenant_id)
      )
    )
    .orderBy(asc(bomLineItems.sort_order))

  // For the public view, hide group rows (no quantity / cost) — the client
  // sees the actual costed lines grouped by code prefix later.
  const portalLines: PortalBomLine[] = lines
    .filter((l) => l.is_group === 0)
    .map((l) => ({
      id: l.id,
      code: l.code,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      unit_cost_cents: l.unit_cost_cents,
      line_total_cents: l.line_total_cents,
      // Use the first two chars of the code as a simple category bucket
      // when no explicit category exists.
      category: (l.code?.split(/[-.]/)[0] || 'GENERAL').toUpperCase(),
    }))

  const isDevStub =
    !!row.docuseal_submission_id &&
    row.docuseal_submission_id.startsWith('dev-sub-')

  return {
    state: 'ok',
    bom: {
      id: bomRow.id,
      label: bomRow.label,
      status: bomRow.status,
      version: bomRow.version,
      tcv_cents: bomRow.tcv_cents,
      total_cost_cents: bomRow.total_cost_cents,
      project_name: bomRow.project_name ?? 'Your project',
      account_name: bomRow.account_name,
      valid_until: row.expires_at.toISOString(),
      docuseal_slug: row.docuseal_slug,
      is_dev_stub: isDevStub,
      lines: portalLines,
    },
  }
}
