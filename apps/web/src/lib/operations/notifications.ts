/**
 * Notifications dispatcher.
 *
 * One entry point: dispatchNotification() — writes an in-app row to
 * `notifications`, optionally sends email via Resend, optionally SMS via
 * Semaphore. Channel routing is decided by the caller (most flows are
 * in_app + email).
 *
 * Why one helper: every server action that fires a notification looks
 * exactly the same — insert row + send. Keeping it in a single function
 * means later refactors (digest, mute, batching) land in one place.
 */

import { db } from '@third-code-erp/database'
import { notifications, users } from '@third-code-erp/database/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { sendEmail, templates, type EmailTemplateId } from './integrations/resend'
import { sendSms } from './integrations/semaphore'
import type { AppRole } from '@third-code-erp/auth'

interface BaseDispatch {
  tenantId: string
  subject: string
  body?: string
  linkUrl?: string
  /** Free-form payload for downstream consumers (e.g. realtime). */
  payload?: Record<string, unknown>
}

interface DispatchToUser extends BaseDispatch {
  recipientUserId: string
  alsoEmail?: boolean
  alsoSms?: boolean
  templateId?: EmailTemplateId
  templateVars?: Record<string, string | number>
}

interface DispatchToRole extends BaseDispatch {
  recipientRoles: AppRole[]
  alsoEmail?: boolean
  templateId?: EmailTemplateId
  templateVars?: Record<string, string | number>
}

interface DispatchToEmail extends BaseDispatch {
  recipientEmail: string
  templateId: EmailTemplateId
  templateVars: Record<string, string | number>
}

export async function notifyUser(d: DispatchToUser): Promise<void> {
  const [recipient] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, d.recipientUserId))
    .limit(1)

  await db.insert(notifications).values({
    tenant_id: d.tenantId,
    recipient_user_id: d.recipientUserId,
    recipient_email: recipient?.email ?? null,
    channel: 'in_app',
    subject: d.subject,
    body: d.body ?? null,
    link_url: d.linkUrl ?? null,
    payload: d.payload ?? null,
  })

  if (d.alsoEmail && recipient?.email && d.templateId && d.templateVars) {
    await sendEmailFromTemplate(recipient.email, d.templateId, d.templateVars)
  }
}

export async function notifyRoles(d: DispatchToRole): Promise<void> {
  const recipients = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.tenant_id, d.tenantId), inArray(users.role, d.recipientRoles)))

  if (recipients.length === 0) return

  await db.insert(notifications).values(
    recipients.map((r) => ({
      tenant_id: d.tenantId,
      recipient_user_id: r.id,
      recipient_email: r.email,
      channel: 'in_app' as const,
      subject: d.subject,
      body: d.body ?? null,
      link_url: d.linkUrl ?? null,
      payload: d.payload ?? null,
    }))
  )

  if (d.alsoEmail && d.templateId && d.templateVars) {
    for (const r of recipients) {
      await sendEmailFromTemplate(r.email, d.templateId, d.templateVars)
    }
  }
}

export async function notifyExternalEmail(d: DispatchToEmail): Promise<void> {
  await db.insert(notifications).values({
    tenant_id: d.tenantId,
    recipient_user_id: null,
    recipient_email: d.recipientEmail,
    channel: 'email',
    subject: d.subject,
    body: d.body ?? null,
    link_url: d.linkUrl ?? null,
    payload: d.payload ?? null,
    sent_at: new Date(),
  })

  await sendEmailFromTemplate(d.recipientEmail, d.templateId, d.templateVars)
}

async function sendEmailFromTemplate(
  to: string,
  templateId: EmailTemplateId,
  vars: Record<string, string | number>
) {
  // Tiny narrowing: each template wants its own var shape. We trust the
  // caller and cast — Zod-style runtime checks are unnecessary for an
  // internal mapping.
  const builder = templates[templateId] as (v: Record<string, string | number>) => {
    subject: string
    html: string
    text: string
  }
  const { subject, html, text } = builder(vars)
  await sendEmail({ to, subject, html, text })
}

export { sendSms }
