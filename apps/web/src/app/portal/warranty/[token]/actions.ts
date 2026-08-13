'use server'

/**
 * Public warranty portal server actions (REFACTOR.md US-WA-001).
 *
 * Runs without an authenticated user — we use the service-role admin client
 * so RLS doesn't block writes. Tenant/project identity is derived from the
 * token row; we never trust client-provided tenant ids.
 */

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { db } from '@third-code-erp/database'
import {
  warrantyPortalTokens,
  warrantyTickets,
  projects,
} from '@third-code-erp/database/schema'
import { and, eq, max } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { notifyExternalEmail, notifyRoles } from '@/lib/operations/notifications'
import { startSlaClock } from '@/lib/operations/sla-clock'

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

type TicketCategory =
  | 'civil'
  | 'electrical'
  | 'plumbing'
  | 'mep'
  | 'finishes'
  | 'fixtures'
  | 'other'

const ALLOWED_CATEGORIES: TicketCategory[] = [
  'civil',
  'electrical',
  'plumbing',
  'mep',
  'finishes',
  'fixtures',
  'other',
]

export async function submitTicket(token: string, formData: FormData): Promise<void> {
  const tokenHash = hashToken(token)

  // 1. Verify token, fetch tenant + project + account.
  const [tokenRow] = await db
    .select({
      tenant_id: warrantyPortalTokens.tenant_id,
      project_id: warrantyPortalTokens.project_id,
      expires_at: warrantyPortalTokens.expires_at,
      revoked_at: warrantyPortalTokens.revoked_at,
      account_id: projects.account_id,
    })
    .from(warrantyPortalTokens)
    .innerJoin(
      projects,
      and(
        eq(projects.id, warrantyPortalTokens.project_id),
        eq(projects.tenant_id, warrantyPortalTokens.tenant_id)
      )
    )
    .where(eq(warrantyPortalTokens.token_hash, tokenHash))
    .limit(1)

  if (!tokenRow) {
    redirect(`/portal/warranty/${token}?error=expired`)
  }

  const isExpired =
    !!tokenRow.revoked_at ||
    (tokenRow.expires_at instanceof Date && tokenRow.expires_at.getTime() < Date.now())
  if (isExpired) {
    redirect(`/portal/warranty/${token}?error=expired`)
  }

  // 2. Validate input.
  const name = str(formData.get('submitted_by_name'))
  const email = str(formData.get('submitted_by_email'))
  const description = str(formData.get('description'))
  const location = str(formData.get('location'))
  const rawCategory = str(formData.get('category'))
  const category: TicketCategory = ALLOWED_CATEGORIES.includes(rawCategory as TicketCategory)
    ? (rawCategory as TicketCategory)
    : 'other'

  if (!name || !email || !description) {
    redirect(`/portal/warranty/${token}?error=invalid`)
  }

  // 3. Generate ticket_number = "WT-" + zero-padded next sequence per tenant.
  const [maxRow] = await db
    .select({
      max_num: max(warrantyTickets.ticket_number),
    })
    .from(warrantyTickets)
    .where(eq(warrantyTickets.tenant_id, tokenRow.tenant_id))

  const nextSeq = extractNextSeq(maxRow?.max_num ?? null)
  const ticketNumber = `WT-${String(nextSeq).padStart(6, '0')}`

  // 4. Insert ticket.
  const [inserted] = await db
    .insert(warrantyTickets)
    .values({
      tenant_id: tokenRow.tenant_id,
      project_id: tokenRow.project_id,
      account_id: tokenRow.account_id ?? null,
      ticket_number: ticketNumber,
      category,
      description,
      location: location || null,
      status: 'open',
      submitted_by_name: name,
      submitted_by_email: email,
    })
    .returning({ id: warrantyTickets.id })

  if (!inserted) {
    redirect(`/portal/warranty/${token}?error=failed`)
  }

  // 5. Start SLA clock (24h to acknowledge).
  await startSlaClock({
    tenantId: tokenRow.tenant_id,
    entityType: 'warranty_ticket',
    entityId: inserted.id,
    label: 'ticket.acknowledge',
  })

  // 6. Notify CX team in-app.
  await notifyRoles({
    tenantId: tokenRow.tenant_id,
    recipientRoles: ['cx'],
    subject: `New warranty ticket ${ticketNumber}`,
    body: `${category} — ${description.slice(0, 160)}${description.length > 160 ? '…' : ''}`,
    linkUrl: `/warranty/${inserted.id}`,
  })

  // 7. Confirmation email to client.
  await notifyExternalEmail({
    tenantId: tokenRow.tenant_id,
    recipientEmail: email,
    subject: `Warranty ticket ${ticketNumber} received`,
    templateId: 'ticket-ack',
    templateVars: {
      ticket_number: ticketNumber,
      description,
    },
  })

  // 8. Audit (no actor — public portal).
  try {
    const diff = { ticket_number: ticketNumber, category, submitted_by_email: email }
    await writeAuditLog({
      tenantId: tokenRow.tenant_id,
      actorId: null,
      entityType: 'warranty_ticket',
      entityId: inserted.id,
      action: 'create',
      diff,
    })
  } catch {
    // never let audit failures block ticket submission
  }

  redirect(`/portal/warranty/${token}?ok=1&ticket=${encodeURIComponent(ticketNumber)}`)
}

/**
 * Given the previous max ticket_number for a tenant (e.g. "WT-000004"),
 * returns the next integer. Falls back to 1 when no rows exist.
 */
function extractNextSeq(prevMax: string | null): number {
  if (!prevMax) return 1
  const m = prevMax.match(/(\d+)\s*$/)
  if (!m) return 1
  const n = parseInt(m[1]!, 10)
  return Number.isFinite(n) ? n + 1 : 1
}
