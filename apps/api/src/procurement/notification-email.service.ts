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
    const subject =
      '[ABI OPS] RFQs ready for supplier outreach'
    const text = `${input.lineCount} ${itemLabel} are flagged for RFQ on ${input.projectName}. ${rfqUrl}`
    const html = [
      '<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:600px">',
      '<h2 style="color:#0F2D4A">RFQs ready for supplier outreach</h2>',
      `<p>${input.lineCount} ${itemLabel} are flagged for RFQ on <strong>${escapeHtml(input.projectName)}</strong>.</p>`,
      `<p><a href="${escapeHtml(rfqUrl)}">Open procurement</a></p>`,
      '<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0"/>',
      '<p style="color:#737373;font-size:12px">ABI OPS - Actuate Builders Inc.</p>',
      '</div>',
    ].join('')

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
        subject,
        html,
        text,
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

    const actionLabel =
      input.payload.action === 'submit_pm_approval'
        ? 'awaiting PM approval'
        : input.payload.action === 'pm_approve'
          ? 'awaiting commercial approval'
          : input.payload.action === 'commercial_approve'
            ? 'ready for SCM issuance'
            : 'returned for revision'
    const purchaseOrderUrl = new URL(
      `/purchase-orders/${input.purchaseOrderId}`,
      webBaseUrl
    ).toString()
    const subject = `[ABI OPS] ${input.poNumber} ${actionLabel}`
    const text = `${input.poNumber} for ${input.projectName} moved from ${input.payload.from_status} to ${input.payload.to_status}. ${purchaseOrderUrl}`
    const html = [
      '<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:600px">',
      `<h2 style="color:#0F2D4A">${escapeHtml(input.poNumber)} ${escapeHtml(actionLabel)}</h2>`,
      `<p><strong>${escapeHtml(input.projectName)}</strong> moved from ${escapeHtml(input.payload.from_status)} to ${escapeHtml(input.payload.to_status)}.</p>`,
      `<p><a href="${escapeHtml(purchaseOrderUrl)}">Open Purchase Order</a></p>`,
      '<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0"/>',
      '<p style="color:#737373;font-size:12px">ABI OPS - Actuate Builders Inc.</p>',
      '</div>',
    ].join('')

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
        subject,
        html,
        text,
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
    const subject = `[ABI OPS] Purchase order ${input.poNumber}`
    const confirmationCopy = input.confirmationUrl
      ? ` Review and confirm this order: ${input.confirmationUrl}`
      : ''
    const text = `Hello ${input.supplierName}, Purchase order ${input.poNumber} for ${input.projectName} is issued. Total: ${totalLabel}. ${purchaseOrderUrl}${confirmationCopy}`
    const html = [
      '<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:600px">',
      `<h2 style="color:#0F2D4A">Purchase order ${escapeHtml(input.poNumber)} issued</h2>`,
      `<p>Hello <strong>${escapeHtml(input.supplierName)}</strong>,</p>`,
      `<p>Purchase order <strong>${escapeHtml(input.poNumber)}</strong> for <strong>${escapeHtml(input.projectName)}</strong> is ready for fulfillment.</p>`,
      `<p>Total: <strong>${escapeHtml(totalLabel)}</strong></p>`,
      `<p><a href="${escapeHtml(purchaseOrderUrl)}">Open Purchase Order</a></p>`,
      ...(input.confirmationUrl
        ? [
            `<p><a href="${escapeHtml(input.confirmationUrl)}">Review and confirm this order</a></p>`,
          ]
        : []),
      '<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0"/>',
      '<p style="color:#737373;font-size:12px">ABI OPS - Actuate Builders Inc.</p>',
      '</div>',
    ].join('')

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
        subject,
        html,
        text,
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
