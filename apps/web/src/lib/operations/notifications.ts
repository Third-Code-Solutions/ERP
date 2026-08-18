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
    await attemptEmailDelivery(recipient.email, d.templateId, d.templateVars, {
      tenant_id: d.tenantId,
      recipient_user_id: d.recipientUserId,
    })
  }
}

export async function notifyRoles(d: DispatchToRole): Promise<void> {
  const recipients = await findRoleRecipients(d.tenantId, d.recipientRoles)

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

  await sendRoleEmails(recipients, d)
}

/**
 * Sends role-targeted email only. Use this after a Core transaction has
 * already created its durable in-app notifications; this helper must never
 * become a second Web mutation authority.
 */
export async function emailRoles(d: DispatchToRole): Promise<void> {
  const recipients = await findRoleRecipients(d.tenantId, d.recipientRoles)
  await sendRoleEmails(recipients, d)
}

export async function notifyExternalEmail(
  d: DispatchToEmail
): Promise<{ delivered: boolean }> {
  const [notification] = await db
    .insert(notifications)
    .values({
      tenant_id: d.tenantId,
      recipient_user_id: null,
      recipient_email: d.recipientEmail,
      channel: 'email',
      subject: d.subject,
      body: d.body ?? null,
      link_url: d.linkUrl ?? null,
      payload: d.payload ?? null,
      sent_at: null,
    })
    .returning({ id: notifications.id })

  let delivery: { id: string; is_dev_stub: boolean }
  try {
    delivery = await sendEmailFromTemplate(
      d.recipientEmail,
      d.templateId,
      d.templateVars
    )
  } catch (error) {
    logEmailDeliveryFailure(error, {
      tenant_id: d.tenantId,
      recipient_kind: 'external',
    })
    return { delivered: false }
  }

  /*
   * The provider call is deliberately outside the database mutation above:
   * the notification row is the durable pending evidence, while this update
   * records a real provider response only.
   */
  if (notification?.id && !delivery.is_dev_stub) {
    await db
      .update(notifications)
      .set({ sent_at: new Date() })
      .where(
        and(
          eq(notifications.id, notification.id),
          eq(notifications.tenant_id, d.tenantId)
        )
      )
  }

  return { delivered: !delivery.is_dev_stub }
}

async function attemptEmailDelivery(
  to: string,
  templateId: EmailTemplateId,
  vars: Record<string, string | number>,
  context: { tenant_id: string; recipient_user_id: string }
): Promise<boolean> {
  try {
    const delivery = await sendEmailFromTemplate(to, templateId, vars)
    return !delivery.is_dev_stub
  } catch (error) {
    logEmailDeliveryFailure(error, {
      ...context,
      recipient_kind: 'user',
    })
    return false
  }
}

async function findRoleRecipients(
  tenantId: string,
  recipientRoles: AppRole[]
): Promise<Array<{ id: string; email: string }>> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), inArray(users.role, recipientRoles)))
}

async function sendRoleEmails(
  recipients: Array<{ id: string; email: string }>,
  dispatch: DispatchToRole
): Promise<void> {
  if (!dispatch.alsoEmail || !dispatch.templateId || !dispatch.templateVars) {
    return
  }

  for (const recipient of recipients) {
    await attemptEmailDelivery(
      recipient.email,
      dispatch.templateId,
      dispatch.templateVars,
      {
        tenant_id: dispatch.tenantId,
        recipient_user_id: recipient.id,
      }
    )
  }
}

function logEmailDeliveryFailure(
  error: unknown,
  context: {
    tenant_id: string
    recipient_kind: 'user' | 'external'
    recipient_user_id?: string
  }
): void {
  console.error(
    JSON.stringify({
      event: 'notification_email_delivery_failed',
      ...context,
      error: error instanceof Error ? error.message : 'unknown',
    })
  )
}

/*
 * This function is intentionally kept as the one provider-facing template
 * boundary so user/role and external-recipient flows share the same result.
 */
async function sendEmailFromTemplate(
  to: string,
  templateId: EmailTemplateId,
  vars: Record<string, string | number>
): Promise<{ id: string; is_dev_stub: boolean }> {
  // Tiny narrowing: each template wants its own var shape. We trust the
  // caller and cast — Zod-style runtime checks are unnecessary for an
  // internal mapping.
  const builder = templates[templateId] as (v: Record<string, string | number>) => {
    subject: string
    html: string
    text: string
  }
  const { subject, html, text } = builder(vars)
  return sendEmail({ to, subject, html, text })
}

export { sendSms }
