/**
 * Resend email client (REFACTOR.md §7.3) and transactional templates.
 *
 * Templates are pure string builders with matching HTML and plain-text
 * versions. Dynamic values are escaped before they enter HTML or links.
 *
 * Live mode: RESEND_API_KEY + EMAIL_FROM env vars.
 * Development/test mode: logs the email payload to stdout via console.warn.
 * Production: throws when credentials are absent.
 */

export type EmailTemplateId =
  | 'kyc-request'
  | 'kyc-result'
  | 'design-ready'
  | 'bom-portal-link'
  | 'bom-signed'
  | 'rfq-dispatch'
  | 'po-issued'
  | 'ticket-ack'
  | 'ticket-schedule'
  | 'cnps-survey'
  | 'sla-breach'

interface EmailEnvelope {
  to: string | string[]
  subject: string
  html: string
  text: string
  attachments?: { filename: string; url?: string; content?: string }[]
}

const hasEmailConfig = () =>
  Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.EMAIL_FROM)

const canUseDevelopmentStub = () => process.env.NODE_ENV !== 'production'

const FROM = () =>
  process.env.EMAIL_FROM || 'ABI OPS <dev@abi-ops.invalid>'

export async function sendEmail(
  envelope: EmailEnvelope
): Promise<{ id: string; is_dev_stub: boolean }> {
  if (!hasEmailConfig()) {
    if (!canUseDevelopmentStub()) {
      throw new Error(
        'Email integration is not configured for production. Set RESEND_API_KEY and EMAIL_FROM.'
      )
    }

    console.warn('[email:dev]', {
      from: FROM(),
      to: envelope.to,
      subject: envelope.subject,
      preview: envelope.text.slice(0, 160),
    })
    return { id: `dev-email-${Date.now()}`, is_dev_stub: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM(),
      to: envelope.to,
      subject: envelope.subject,
      html: envelope.html,
      text: envelope.text,
      attachments: envelope.attachments,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`)
  }
  const body = (await res.json()) as { id: string }
  return { id: body.id, is_dev_stub: false }
}

// -----------------------------------------------------------------------------
// Transactional templates
// -----------------------------------------------------------------------------

const BRAND_NAVY = '#0F2D4A'
const BRAND_ORANGE = '#E07B2A'
const BODY_FONT = 'Arial, Helvetica, sans-serif'

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

function actionLink(url: string, label: string, background = BRAND_NAVY): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 16px;background:${background};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700">${escapeHtml(label)}</a>`
}

function noteBlock(value: string): string {
  return `<div style="margin:20px 0;padding:14px 16px;background:#f4f6f8;border-left:3px solid ${BRAND_ORANGE};color:#334155">${escapeHtml(value)}</div>`
}

function wrap(subject: string, html: string, text: string) {
  const safeSubject = escapeHtml(subject)
  const preheader = escapeHtml(text.replace(/\s+/g, ' ').trim().slice(0, 140))

  return {
    subject: `[ABI OPS] ${subject}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f7;color:#17212b;font-family:${BODY_FONT};font-size:15px;line-height:1.55"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe1e6;border-radius:10px"><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #edf0f2"><div style="color:${BRAND_NAVY};font-size:18px;font-weight:700;letter-spacing:.02em">ABI OPS</div><div style="margin-top:3px;color:#64748b;font-size:12px">Actuate Builders Inc.</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 18px;color:${BRAND_NAVY};font-size:24px;line-height:1.25;font-weight:700">${safeSubject}</h1>${html}</td></tr><tr><td style="padding:18px 28px 24px;border-top:1px solid #edf0f2;color:#64748b;font-size:12px"><p style="margin:0 0 8px">This message was sent by ABI OPS for Actuate Builders Inc.</p><p style="margin:0">If you did not expect this message, contact your workspace administrator.</p></td></tr></table></td></tr></table></body></html>`,
    text: `${subject}\n\n${text}\n\nABI OPS\nActuate Builders Inc.`,
  }
}

export const templates = {
  'kyc-request': (vars: { account_name: string; review_url: string }) =>
    wrap(
      'KYC review required',
      `<p>Account <strong>${escapeHtml(vars.account_name)}</strong> is waiting for KYC review.</p><p style="margin:22px 0">${actionLink(vars.review_url, 'Open KYC queue')}</p>`,
      `Account ${vars.account_name} is waiting for KYC review. Open the KYC queue: ${vars.review_url}`
    ),
  'kyc-result': (vars: { account_name: string; decision: string; notes?: string; account_url: string }) =>
    wrap(
      `KYC review ${vars.decision}: ${vars.account_name}`,
      `<p>The KYC review for <strong>${escapeHtml(vars.account_name)}</strong> is complete.</p><p><strong>Decision:</strong> ${escapeHtml(vars.decision)}</p>${vars.notes ? noteBlock(vars.notes) : ''}<p style="margin:22px 0">${actionLink(vars.account_url, 'View account')}</p>`,
      `KYC review ${vars.decision} for ${vars.account_name}. ${vars.notes ? `Notes: ${vars.notes} ` : ''}View the account: ${vars.account_url}`
    ),
  'design-ready': (vars: { opportunity_name: string; design_url: string }) =>
    wrap(
      'Design files ready',
      `<p>Design files for <strong>${escapeHtml(vars.opportunity_name)}</strong> are ready for client presentation.</p><p style="margin:22px 0">${actionLink(vars.design_url, 'Open opportunity')}</p>`,
      `Design files for ${vars.opportunity_name} are ready for client presentation. Open the opportunity: ${vars.design_url}`
    ),
  'bom-portal-link': (vars: { project_name: string; portal_url: string; valid_until: string }) =>
    wrap(
      'BOM ready for review',
      `<p>The Bill of Materials for <strong>${escapeHtml(vars.project_name)}</strong> is ready for review and signature.</p><p style="margin:22px 0">${actionLink(vars.portal_url, 'Review and sign BOM', BRAND_ORANGE)}</p><p style="color:#64748b;font-size:13px">This review link expires on ${escapeHtml(vars.valid_until)}.</p>`,
      `The Bill of Materials for ${vars.project_name} is ready for review and signature. Review it here: ${vars.portal_url}. The link expires on ${vars.valid_until}.`
    ),
  'bom-signed': (vars: { project_name: string; tcv_php: string; project_url: string }) =>
    wrap(
      'BOM signed by client',
      `<p>The client signed the Bill of Materials for <strong>${escapeHtml(vars.project_name)}</strong>.</p><p><strong>Total contract value:</strong> PHP ${escapeHtml(vars.tcv_php)}</p><p style="margin:22px 0">${actionLink(vars.project_url, 'Open project')}</p>`,
      `The client signed the Bill of Materials for ${vars.project_name}. Total contract value: PHP ${vars.tcv_php}. Open the project: ${vars.project_url}`
    ),
  'rfq-dispatch': (vars: { project_name: string; line_count: number; rfq_url: string }) =>
    wrap(
      'RFQ request ready',
      `<p>The procurement team prepared <strong>${vars.line_count} ${vars.line_count === 1 ? 'line item' : 'line items'}</strong> for supplier quotes on <strong>${escapeHtml(vars.project_name)}</strong>.</p><p style="margin:22px 0">${actionLink(vars.rfq_url, 'Open procurement')}</p>`,
      `The procurement team prepared ${vars.line_count} ${vars.line_count === 1 ? 'line item' : 'line items'} for supplier quotes on ${vars.project_name}. Open procurement: ${vars.rfq_url}`
    ),
  'po-issued': (vars: { po_number: string; total_php: string; supplier_name: string; po_pdf_url?: string }) =>
    wrap(
      `Purchase order ${vars.po_number} issued`,
      `<p>Dear ${escapeHtml(vars.supplier_name)},</p><p>Purchase order <strong>${escapeHtml(vars.po_number)}</strong> has been issued for a total value of <strong>PHP ${escapeHtml(vars.total_php)}</strong>.</p>${vars.po_pdf_url ? `<p style="margin:22px 0">${actionLink(vars.po_pdf_url, 'Download purchase order')}</p>` : ''}`,
      `Dear ${vars.supplier_name}, purchase order ${vars.po_number} has been issued for PHP ${vars.total_php}.${vars.po_pdf_url ? ` Download the purchase order: ${vars.po_pdf_url}` : ''}`
    ),
  'ticket-ack': (vars: { ticket_number: string; description: string }) =>
    wrap(
      `Warranty request received: ${vars.ticket_number}`,
      `<p>We received your warranty request. Our customer experience team will review it and reply within one business day.</p><p><strong>Reference:</strong> ${escapeHtml(vars.ticket_number)}</p><p><strong>Issue:</strong> ${escapeHtml(vars.description)}</p>`,
      `We received warranty request ${vars.ticket_number}. Our customer experience team will reply within one business day. Issue: ${vars.description}`
    ),
  'ticket-schedule': (vars: { ticket_number: string; scheduled_for: string; confirm_url: string }) =>
    wrap(
      `Repair appointment scheduled: ${vars.ticket_number}`,
      `<p>Your repair is scheduled for <strong>${escapeHtml(vars.scheduled_for)}</strong>.</p><p style="margin:22px 0">${actionLink(vars.confirm_url, 'Confirm or request a change')}</p>`,
      `Repair ticket ${vars.ticket_number} is scheduled for ${vars.scheduled_for}. Confirm or request a change: ${vars.confirm_url}`
    ),
  'cnps-survey': (vars: { ticket_number: string; survey_url: string }) =>
    wrap(
      'Service feedback requested',
      `<p>Your warranty ticket <strong>${escapeHtml(vars.ticket_number)}</strong> is closed. Please share your experience using the link below.</p><p style="margin:22px 0">${actionLink(vars.survey_url, 'Share feedback')}</p>`,
      `Your warranty ticket ${vars.ticket_number} is closed. Share your service feedback: ${vars.survey_url}`
    ),
  'sla-breach': (vars: { entity_label: string; sla_label: string; project_name?: string; link_url: string }) =>
    wrap(
      `Action required: ${vars.sla_label}`,
      `<p>The service-level target <strong>${escapeHtml(vars.sla_label)}</strong> was missed for <strong>${escapeHtml(vars.entity_label)}</strong>${vars.project_name ? ` in <strong>${escapeHtml(vars.project_name)}</strong>` : ''}.</p><p style="margin:22px 0">${actionLink(vars.link_url, 'Review in ABI OPS')}</p>`,
      `The service-level target ${vars.sla_label} was missed for ${vars.entity_label}${vars.project_name ? ` in ${vars.project_name}` : ''}. Review it in ABI OPS: ${vars.link_url}`
    ),
} as const

export type TemplateBuilders = typeof templates
