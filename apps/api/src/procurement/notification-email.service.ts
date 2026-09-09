import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PurchaseOrderWorkflowNotificationPayload } from '@third-code-erp/shared-types'

interface SendRfqCreatedEmail {
  idempotencyKey: string
  lineCount: number
  projectName: string
  recipientEmail: string
  rfqId: string
}

export interface SendPurchaseOrderWorkflowEmail {
  idempotencyKey: string
  poNumber: string
  projectName: string
  recipientEmail: string
  purchaseOrderId: string
  payload: PurchaseOrderWorkflowNotificationPayload
}

export interface SendPurchaseOrderSupplierEmail {
  idempotencyKey: string
  poNumber: string
  projectName: string
  recipientEmail: string
  supplierName: string
  totalCents: number
  purchaseOrderId: string
  confirmationUrl?: string
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!
  )
}

const BRAND_NAVY = '#0F2D4A'
const BRAND_ORANGE = '#E07B2A'
const BODY_FONT = 'Arial, Helvetica, sans-serif'

function actionLink(url: string, label: string, background = BRAND_NAVY): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 16px;background:${background};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700">${escapeHtml(label)}</a>`
}

function renderEmail(subject: string, bodyHtml: string, text: string): {
  subject: string
  html: string
  text: string
} {
  const safeSubject = escapeHtml(subject)
  const preheader = escapeHtml(text.replace(/\s+/g, ' ').trim().slice(0, 140))

  return {
    subject: `[ABI OPS] ${subject}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f7;color:#17212b;font-family:${BODY_FONT};font-size:15px;line-height:1.55"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe1e6;border-radius:10px"><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #edf0f2"><div style="color:${BRAND_NAVY};font-size:18px;font-weight:700;letter-spacing:.02em">ABI OPS</div><div style="margin-top:3px;color:#64748b;font-size:12px">Actuate Builders Inc.</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 18px;color:${BRAND_NAVY};font-size:24px;line-height:1.25;font-weight:700">${safeSubject}</h1>${bodyHtml}</td></tr><tr><td style="padding:18px 28px 24px;border-top:1px solid #edf0f2;color:#64748b;font-size:12px"><p style="margin:0 0 8px">This message was sent by ABI OPS for Actuate Builders Inc.</p><p style="margin:0">If you did not expect this message, contact your workspace administrator.</p></td></tr></table></td></tr></table></body></html>`,
    text: `${subject}\n\n${text}\n\nABI OPS\nActuate Builders Inc.`,
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function purchaseOrderActionLabel(
  action: PurchaseOrderWorkflowNotificationPayload['action']
): string {
  switch (action) {
    case 'submit_pm_approval':
      return 'awaiting PM approval'
    case 'pm_approve':
      return 'awaiting commercial approval'
    case 'commercial_approve':
      return 'ready for SCM issuance'
    case 'scm_issue':
      return 'issued to supplier'
    default:
      return 'returned for revision'
  }
}

function formatCents(totalCents: number): string {
  const pesos = Math.floor(totalCents / 100)
  const centavos = totalCents % 100
  return `${pesos.toLocaleString('en-PH')}.${String(centavos).padStart(2, '0')}`
}

@Injectable()
export class NotificationEmailService {
  constructor(private readonly config: ConfigService) {}

  async sendRfqCreated(
    input: SendRfqCreatedEmail
  ): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    const from = this.config.get<string>('EMAIL_FROM')
    const webBaseUrl = this.config.get<string>('ERP_WEB_BASE_URL')
    if (!apiKey || !from || !webBaseUrl) {
      throw new Error('RFQ email delivery is not configured')
    }
    if (
      input.idempotencyKey.length === 0 ||
      input.idempotencyKey.length > 256
    ) {
      throw new Error('Invalid RFQ email idempotency key')
    }

    const itemLabel =
      input.lineCount === 1 ? 'line item' : 'line items'
    const rfqUrl = new URL(
      `/procurement/rfqs/${input.rfqId}`,
      webBaseUrl
    ).toString()
    const subject = 'RFQ request ready'
    const text = `The procurement team prepared ${input.lineCount} ${itemLabel} for supplier quotes on ${input.projectName}. Open procurement: ${rfqUrl}`
    const message = renderEmail(
      subject,
      `<p>The procurement team prepared <strong>${input.lineCount} ${itemLabel}</strong> for supplier quotes on <strong>${escapeHtml(input.projectName)}</strong>.</p><p style="margin:22px 0">${actionLink(rfqUrl, 'Open procurement')}</p>`,
      text
    )

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.recipientEmail],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(`Resend RFQ email failed (${response.status})`)
    }
    const body = (await response.json()) as { id?: unknown }
    if (typeof body.id !== 'string' || body.id.length === 0) {
      throw new Error('Resend returned an invalid email identifier')
    }
    return body.id
  }

  async sendPurchaseOrderWorkflow(
    input: SendPurchaseOrderWorkflowEmail
  ): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    const from = this.config.get<string>('EMAIL_FROM')
    const webBaseUrl = this.config.get<string>('ERP_WEB_BASE_URL')
    if (!apiKey || !from || !webBaseUrl) {
      throw new Error('Purchase Order workflow email delivery is not configured')
    }
    if (
      input.idempotencyKey.length === 0 ||
      input.idempotencyKey.length > 256
    ) {
      throw new Error('Invalid Purchase Order workflow email idempotency key')
    }

    const actionLabel = purchaseOrderActionLabel(input.payload.action)
    const purchaseOrderUrl = new URL(
      `/purchase-orders/${input.purchaseOrderId}`,
      webBaseUrl
    ).toString()
    const subject = `${input.poNumber} ${actionLabel}`
    const fromStatus = formatStatus(input.payload.from_status)
    const toStatus = formatStatus(input.payload.to_status)
    const text = `Purchase order ${input.poNumber} for ${input.projectName} is ${actionLabel}. Status changed from ${fromStatus} to ${toStatus}. Review the purchase order: ${purchaseOrderUrl}`
    const message = renderEmail(
      subject,
      `<p>Purchase order <strong>${escapeHtml(input.poNumber)}</strong> for <strong>${escapeHtml(input.projectName)}</strong> is ${escapeHtml(actionLabel)}.</p><p><strong>Status:</strong> ${escapeHtml(toStatus)}</p><p style="margin:22px 0">${actionLink(purchaseOrderUrl, 'Open purchase order')}</p>`,
      text
    )

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.recipientEmail],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(
        `Resend Purchase Order workflow email failed (${response.status})`
      )
    }
    const body = (await response.json()) as { id?: unknown }
    if (typeof body.id !== 'string' || body.id.length === 0) {
      throw new Error('Resend returned an invalid email identifier')
    }
    return body.id
  }

  async sendPurchaseOrderSupplier(
    input: SendPurchaseOrderSupplierEmail
  ): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    const from = this.config.get<string>('EMAIL_FROM')
    const webBaseUrl = this.config.get<string>('ERP_WEB_BASE_URL')
    if (!apiKey || !from || !webBaseUrl) {
      throw new Error(
        'Purchase Order supplier email delivery is not configured'
      )
    }
    if (
      input.idempotencyKey.length === 0 ||
      input.idempotencyKey.length > 256
    ) {
      throw new Error(
        'Invalid Purchase Order supplier email idempotency key'
      )
    }
    if (
      !Number.isSafeInteger(input.totalCents) ||
      input.totalCents < 0
    ) {
      throw new Error('Invalid Purchase Order supplier total')
    }

    const purchaseOrderUrl = new URL(
      `/purchase-orders/${input.purchaseOrderId}`,
      webBaseUrl
    ).toString()
    const totalLabel = `PHP ${formatCents(input.totalCents)}`
    const subject = `Purchase order ${input.poNumber} issued`
    const text = `Hello ${input.supplierName}, purchase order ${input.poNumber} for ${input.projectName} has been issued. Total order value: ${totalLabel}. Review the purchase order: ${purchaseOrderUrl}.${input.confirmationUrl ? ` Confirm or request a change: ${input.confirmationUrl}` : ''}`
    const message = renderEmail(
      subject,
      `<p>Dear ${escapeHtml(input.supplierName)},</p><p>Purchase order <strong>${escapeHtml(input.poNumber)}</strong> for <strong>${escapeHtml(input.projectName)}</strong> has been issued.</p><p><strong>Total order value:</strong> ${escapeHtml(totalLabel)}</p><p style="margin:22px 0">${actionLink(purchaseOrderUrl, 'Review purchase order')}</p>${input.confirmationUrl ? `<p style="margin:22px 0">${actionLink(input.confirmationUrl, 'Confirm or request a change', BRAND_ORANGE)}</p>` : ''}`,
      text
    )

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.recipientEmail],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(
        `Resend Purchase Order supplier email failed (${response.status})`
      )
    }
    const body = (await response.json()) as { id?: unknown }
    if (typeof body.id !== 'string' || body.id.length === 0) {
      throw new Error('Resend returned an invalid email identifier')
    }
    return body.id
  }
}
