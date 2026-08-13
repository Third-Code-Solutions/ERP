'use server'

import { createHash } from 'crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  bomPortalTokens,
  boms,
  bomLineItems,
  projects,
  accounts,
} from '@third-code-erp/database/schema'
import { notifyRoles } from '@/lib/operations/notifications'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { runSignedBomAward } from '@/lib/operations/award-automation'
import { isDevelopmentStubSubmissionId } from '@/lib/operations/integrations/docuseal'

interface SignResult {
  ok?: true
  awardHandoffId?: string
  warning?: string
  error?: string
}
/**
 * Mark a portal token as used (signed) and lock the BOM. Public action Ã¢â‚¬â€
 * the only auth is possession of the URL token, which we re-hash + look up.
 */
export async function recordSign(token: string): Promise<SignResult> {
  if (typeof token !== 'string' || token.length < 16) {
    return { error: 'Invalid token' }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const now = new Date()

  let committed: {
    row: {
      tenant_id: string
      bom_id: string
    }
    ctx: {
      tcv_cents: number
      project_id: string | null
      project_name: string | null
    } | undefined
    award: { handoffId: string }
  }

  try {
    committed = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: bomPortalTokens.id,
          tenant_id: bomPortalTokens.tenant_id,
          bom_id: bomPortalTokens.bom_id,
          expires_at: bomPortalTokens.expires_at,
          used_at: bomPortalTokens.used_at,
          docuseal_submission_id: bomPortalTokens.docuseal_submission_id,
        })
        .from(bomPortalTokens)
        .where(eq(bomPortalTokens.token_hash, tokenHash))
        .limit(1)
        .for('update')

      if (!row) throw new Error('Token not found')
      if (row.used_at) throw new Error('This BOM has already been signed')
      if (row.expires_at.getTime() < Date.now()) {
        throw new Error('This portal link has expired')
      }
      if (isDevelopmentStubSubmissionId(row.docuseal_submission_id)) {
        throw new Error(
          'This legacy development signing link is disabled. Request a new signing link from the workspace.'
        )
      }

      const [bom] = await tx
        .select({
          status: boms.status,
          approved_by: boms.approved_by,
          created_by: boms.created_by,
        })
        .from(boms)
        .where(and(eq(boms.id, row.bom_id), eq(boms.tenant_id, row.tenant_id)))
        .limit(1)

      if (!bom) throw new Error('BOM not found')
      if (bom.status === 'locked') throw new Error('This BOM has already been signed')
      if (bom.status !== 'approved') throw new Error('Only an approved BOM can be signed')

      await tx
        .update(bomPortalTokens)
        .set({ used_at: now })
        .where(
          and(
            eq(bomPortalTokens.id, row.id),
            eq(bomPortalTokens.tenant_id, row.tenant_id)
          )
        )
      await tx
        .update(boms)
        .set({ status: 'locked', locked_at: now, updated_at: now })
        .where(and(eq(boms.id, row.bom_id), eq(boms.tenant_id, row.tenant_id)))

      const award = await runSignedBomAward(tx, {
        tenantId: row.tenant_id,
        bomId: row.bom_id,
        actorId: bom.approved_by ?? bom.created_by,
        downPaymentBps: 0,
        now,
      })

      await writeAuditLogInTransaction(tx, {
        tenantId: row.tenant_id,
        actorId: bom.approved_by ?? bom.created_by,
        entityType: 'bom',
        entityId: row.bom_id,
        action: 'lock',
        diff: {
          source: 'client_portal_sign',
          signed_at: now.toISOString(),
          award_handoff_id: award.handoffId,
        },
      })

      const [ctx] = await tx
        .select({
          tcv_cents: boms.tcv_cents,
          project_id: projects.id,
          project_name: projects.name,
        })
        .from(boms)
        .leftJoin(
          projects,
          and(
            eq(boms.project_id, projects.id),
            eq(projects.tenant_id, row.tenant_id)
          )
        )
        .where(and(eq(boms.id, row.bom_id), eq(boms.tenant_id, row.tenant_id)))
        .limit(1)

      return { row, ctx, award }
    })
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Token not found' ||
        error.message === 'This BOM has already been signed' ||
        error.message === 'This portal link has expired' ||
        error.message === 'Only an approved BOM can be signed' ||
        error.message ===
          'This legacy development signing link is disabled. Request a new signing link from the workspace.'
      ) {
        return { error: error.message }
      }
    }
    return { error: 'BOM signing failed. No award handoff was committed.' }
  }

  const { row, ctx, award } = committed
  const tcvPhp = ctx?.tcv_cents
    ? (ctx.tcv_cents / 100).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  try {
    await notifyRoles({
      tenantId: row.tenant_id,
      recipientRoles: ['sales', 'commercial', 'admin', 'owner'],
      subject: 'Client signed BOM - ' + (ctx?.project_name ?? 'project'),
      body: 'The client has signed the BOM. TCV: PHP ' + tcvPhp + '.',
      linkUrl: ctx?.project_id ? '/projects/' + ctx.project_id + '/bom' : '/bom',
      alsoEmail: true,
      templateId: 'bom-signed',
      templateVars: {
        project_name: ctx?.project_name ?? 'your project',
        tcv_php: tcvPhp,
        project_url: ctx?.project_id ? '/projects/' + ctx.project_id : '/bom',
      },
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'bom_signed_notification_failed',
        tenant_id: row.tenant_id,
        bom_id: row.bom_id,
        award_handoff_id: award.handoffId,
        error: error instanceof Error ? error.message : 'unknown',
      })
    )
    return {
      ok: true,
      awardHandoffId: award.handoffId,
      warning: 'BOM signed and awarded; notification delivery needs attention.',
    }
  }

  return { ok: true, awardHandoffId: award.handoffId }
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
 * Resolve a portal token to a renderable BOM payload. Public Ã¢â‚¬â€ never
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
    .leftJoin(
      projects,
      and(
        eq(boms.project_id, projects.id),
        eq(projects.tenant_id, row.tenant_id)
      )
    )
    .leftJoin(
      accounts,
      and(
        eq(projects.account_id, accounts.id),
        eq(accounts.tenant_id, row.tenant_id)
      )
    )
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

  // For the public view, hide group rows (no quantity / cost) Ã¢â‚¬â€ the client
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

  const isDevStub = isDevelopmentStubSubmissionId(row.docuseal_submission_id)

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
