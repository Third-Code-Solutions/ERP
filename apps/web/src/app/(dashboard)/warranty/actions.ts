'use server'

/**
 * CX warranty-ticket server actions (REFACTOR.md US-WA-002 + US-WA-003).
 *
 * Capability gate: `warranty.manage` (admin/owner/cx).
 *
 * - acknowledgeTicket: stamps ack → stops ticket.acknowledge SLA, starts
 *   ticket.schedule SLA, emails client.
 * - scheduleTicketRepair: stamps scheduled_at + emails client with proposed time.
 * - markTicketInProgress: status transition only.
 * - closeTicket: requires service report document → stops all SLAs → emits the
 *   cnps/survey.scheduled event so Inngest dispatches the 48h survey.
 * - postTicketMessage: append to thread.
 * - mintWarrantyPortalToken: returns plaintext token + URL (one-time view).
 */

import { revalidatePath } from 'next/cache'
import { randomBytes, createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile, requireCapability } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  warrantyTickets,
  ticketMessages,
  warrantyPortalTokens,
  projects,
  documents,
} from '@third-code-erp/database/schema'
import { stampActorInTransaction, writeAuditLog, writeAuditLogInTransaction, computeDiff } from '@/lib/audit'
import { notifyExternalEmail } from '@/lib/operations/notifications'
import { startSlaClock, stopSlaClock } from '@/lib/operations/sla-clock'
import { inngest } from '@/lib/inngest'

type ActionResult = { error?: string; ok?: true }

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
  )
}

async function loadTicket(profileTenantId: string, ticketId: string) {
  const [ticket] = await db
    .select()
    .from(warrantyTickets)
    .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profileTenantId)))
    .limit(1)
  return ticket ?? null
}

export async function acknowledgeTicket(ticketId: string): Promise<ActionResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  let existing: typeof warrantyTickets.$inferSelect
  try {
    existing = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [ticket] = await tx
        .select()
        .from(warrantyTickets)
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')
      if (!ticket) throw new Error('Ticket not found')
      if (ticket.status !== 'open') throw new Error('Only open tickets can be acknowledged')
      const now = new Date()
      const [updated] = await tx
        .update(warrantyTickets)
        .set({ status: 'acknowledged', acknowledged_at: now, updated_at: now })
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId), eq(warrantyTickets.status, 'open')))
        .returning({ id: warrantyTickets.id })
      if (!updated) throw new Error('Ticket changed; refresh before trying again')
      await stopSlaClock({ tenantId: profile.tenantId, entityType: 'warranty_ticket', entityId: ticketId, label: 'ticket.acknowledge', client: tx })
      await startSlaClock({ tenantId: profile.tenantId, entityType: 'warranty_ticket', entityId: ticketId, label: 'ticket.schedule', client: tx })
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'warranty_ticket',
        entityId: ticketId,
        action: 'status_change',
        diff: computeDiff({ status: ticket.status }, { status: 'acknowledged' }),
      })
      return ticket
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Ticket could not be acknowledged' }
  }

  if (existing.submitted_by_email) {
    await notifyExternalEmail({
      tenantId: profile.tenantId,
      recipientEmail: existing.submitted_by_email,
      subject: `Ticket ${existing.ticket_number} acknowledged`,
      templateId: 'ticket-schedule',
      templateVars: {
        ticket_number: existing.ticket_number,
        scheduled_for: 'TBD — your project manager will confirm shortly',
        confirm_url: `${siteBase()}/warranty/${ticketId}`,
      },
    })
  }

  revalidatePath(`/warranty/${ticketId}`)
  revalidatePath('/warranty')
  return { ok: true }
}

export async function scheduleTicketRepair(
  ticketId: string,
  scheduledIsoStr: string
): Promise<ActionResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const scheduled = new Date(scheduledIsoStr)
  if (Number.isNaN(scheduled.getTime())) {
    return { error: 'Invalid scheduled date' }
  }

  let existing: typeof warrantyTickets.$inferSelect
  try {
    existing = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [ticket] = await tx
        .select()
        .from(warrantyTickets)
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')
      if (!ticket) throw new Error('Ticket not found')
      if (!['acknowledged', 'scheduled', 'in_progress'].includes(ticket.status)) throw new Error('Only acknowledged, scheduled, or in-progress tickets can be scheduled')
      const now = new Date()
      const [updated] = await tx
        .update(warrantyTickets)
        .set({ status: 'scheduled', scheduled_at: scheduled, updated_at: now })
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId), eq(warrantyTickets.status, ticket.status)))
        .returning({ id: warrantyTickets.id })
      if (!updated) throw new Error('Ticket changed; refresh before trying again')
      await stopSlaClock({ tenantId: profile.tenantId, entityType: 'warranty_ticket', entityId: ticketId, label: 'ticket.schedule', client: tx })
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'warranty_ticket',
        entityId: ticketId,
        action: 'status_change',
        diff: computeDiff({ status: ticket.status, scheduled_at: ticket.scheduled_at }, { status: 'scheduled', scheduled_at: scheduled }),
      })
      return ticket
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Ticket could not be scheduled' }
  }

  if (existing.submitted_by_email) {
    await notifyExternalEmail({
      tenantId: profile.tenantId,
      recipientEmail: existing.submitted_by_email,
      subject: `Repair scheduled — ticket ${existing.ticket_number}`,
      templateId: 'ticket-schedule',
      templateVars: {
        ticket_number: existing.ticket_number,
        scheduled_for: scheduled.toLocaleString('en-PH'),
        confirm_url: `${siteBase()}/warranty/${ticketId}`,
      },
    })
  }

  revalidatePath(`/warranty/${ticketId}`)
  revalidatePath('/warranty')
  return { ok: true }
}

export async function markTicketInProgress(ticketId: string): Promise<ActionResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  try {
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [ticket] = await tx
        .select()
        .from(warrantyTickets)
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')
      if (!ticket) throw new Error('Ticket not found')
      if (!['acknowledged', 'scheduled'].includes(ticket.status)) throw new Error('Only acknowledged or scheduled tickets can be marked in-progress')
      const now = new Date()
      const [updated] = await tx
        .update(warrantyTickets)
        .set({ status: 'in_progress', updated_at: now })
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId), eq(warrantyTickets.status, ticket.status)))
        .returning({ id: warrantyTickets.id })
      if (!updated) throw new Error('Ticket changed; refresh before trying again')
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'warranty_ticket',
        entityId: ticketId,
        action: 'status_change',
        diff: computeDiff({ status: ticket.status }, { status: 'in_progress' }),
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Ticket could not be started' }
  }

  revalidatePath(`/warranty/${ticketId}`)
  return { ok: true }
}

export async function closeTicket(
  ticketId: string,
  serviceReportDocumentId: string
): Promise<ActionResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  if (!serviceReportDocumentId) {
    return { error: 'Service report document is required to close the ticket' }
  }

  try {
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [ticket] = await tx
        .select()
        .from(warrantyTickets)
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')
      if (!ticket) throw new Error('Ticket not found')
      if (!['open', 'acknowledged', 'scheduled', 'in_progress'].includes(ticket.status)) throw new Error('Only non-terminal tickets can be closed')
      const [doc] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.id, serviceReportDocumentId), eq(documents.tenant_id, profile.tenantId), eq(documents.project_id, ticket.project_id)))
        .limit(1)
      if (!doc) throw new Error('Service report document not found in this project')
      const now = new Date()
      const [updated] = await tx
        .update(warrantyTickets)
        .set({ status: 'closed', closed_at: now, service_report_document_id: serviceReportDocumentId, updated_at: now })
        .where(and(eq(warrantyTickets.id, ticketId), eq(warrantyTickets.tenant_id, profile.tenantId), eq(warrantyTickets.status, ticket.status)))
        .returning({ id: warrantyTickets.id })
      if (!updated) throw new Error('Ticket changed; refresh before trying again')
      await stopSlaClock({ tenantId: profile.tenantId, entityType: 'warranty_ticket', entityId: ticketId, client: tx })
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'warranty_ticket',
        entityId: ticketId,
        action: 'status_change',
        diff: computeDiff({ status: ticket.status }, { status: 'closed', service_report_document_id: serviceReportDocumentId }),
      })
      return ticket
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Ticket could not be closed' }
  }

  // Schedule the 48h CNPS survey via Inngest.
  await inngest
    .send({
      name: 'cnps/survey.scheduled',
      data: {
        ticketId,
        tenantId: profile.tenantId,
      },
    })
    .catch(() => undefined) // Inngest may be unreachable in dev; cron will still pick it up.

  revalidatePath(`/warranty/${ticketId}`)
  revalidatePath('/warranty')
  return { ok: true }
}

export async function postTicketMessage(
  ticketId: string,
  body: string,
  isInternal: boolean
): Promise<ActionResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const trimmed = (body ?? '').trim()
  if (!trimmed) return { error: 'Message cannot be empty' }

  const existing = await loadTicket(profile.tenantId, ticketId)
  if (!existing) return { error: 'Ticket not found' }

  await db.insert(ticketMessages).values({
    tenant_id: profile.tenantId,
    ticket_id: ticketId,
    body: trimmed.slice(0, 8000),
    is_internal: !!isInternal,
    sender_user_id: profile.user.id,
    sender_name: profile.fullName,
  })

  // If client-visible and we have an email, mirror it via notifyExternalEmail.
  if (!isInternal && existing.submitted_by_email) {
    await notifyExternalEmail({
      tenantId: profile.tenantId,
      recipientEmail: existing.submitted_by_email,
      subject: `Update on ticket ${existing.ticket_number}`,
      templateId: 'ticket-ack',
      templateVars: {
        ticket_number: existing.ticket_number,
        description: trimmed.slice(0, 500),
      },
    })
  }

  revalidatePath(`/warranty/${ticketId}`)
  return { ok: true }
}

interface MintTokenResult {
  token?: string
  url?: string
  error?: string
}

export async function mintWarrantyPortalToken(projectId: string): Promise<MintTokenResult> {
  const profile = await requireUserProfile()
  try {
    requireCapability(profile, 'warranty.manage')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  // Verify project belongs to the tenant.
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!proj) return { error: 'Project not found' }

  const plaintext = randomBytes(24).toString('hex')
  const hash = createHash('sha256').update(plaintext).digest('hex')

  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1) // 1-year warranty window

  const [inserted] = await db
    .insert(warrantyPortalTokens)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      token_hash: hash,
      expires_at: expiresAt,
    })
    .returning({ id: warrantyPortalTokens.id })

  if (!inserted) return { error: 'Failed to mint token' }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'warranty_portal_token',
    entityId: inserted.id,
    action: 'create',
    diff: { project_id: projectId, expires_at: expiresAt.toISOString() },
  })

  const url = `${siteBase()}/portal/warranty/${plaintext}`
  return { token: plaintext, url }
}
