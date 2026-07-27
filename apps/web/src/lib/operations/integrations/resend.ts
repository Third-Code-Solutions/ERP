/**
 * Resend email client (REFACTOR.md §7.3) + the 11 transactional templates.
 *
 * Templates are pure string-builder functions for now (HTML + plaintext).
 * Migrating each to a React Email component when the Resend SDK is added
 * is a mechanical refactor — the call sites won't change.
 *
 * Live mode: RESEND_API_KEY + EMAIL_FROM env vars.
 * Dev mode: logs the email payload to stdout via console.warn (visible in
 *           server logs) so flows can be verified without sending mail.
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

const isDev = () => !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM

const FROM = () =>
  process.env.EMAIL_FROM || 'Third Code ERP <dev@third-code.invalid>'

export async function sendEmail(envelope: EmailEnvelope): Promise<{ id: string; is_dev_stub: boolean }> {
  if (isDev()) {
    // eslint-disable-next-line no-console
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
// 11 templates per REFACTOR §7.3
// -----------------------------------------------------------------------------

const wrap = (subject: string, html: string, text: string) => ({
  subject: `[Third Code ERP] ${subject}`,
  html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:600px"><h2 style="color:#0F2D4A">${subject}</h2>${html}<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0"/><p style="color:#737373;font-size:12px">Third Code ERP — Third Code Solutions Inc.</p></div>`,
  text: `${subject}\n\n${text}\n\n— Third Code ERP`,
})

export const templates = {
  'kyc-request': (vars: { account_name: string; review_url: string }) =>
    wrap(
      'New account pending KYC review',
      `<p>A new account <strong>${vars.account_name}</strong> is pending your financial evaluation.</p><p><a href="${vars.review_url}" style="display:inline-block;padding:10px 16px;background:#0F2D4A;color:white;text-decoration:none;border-radius:6px">Open KYC queue →</a></p>`,
      `New account ${vars.account_name} is pending KYC. Review: ${vars.review_url}`
    ),
  'kyc-result': (vars: { account_name: string; decision: string; notes?: string; account_url: string }) =>
    wrap(
      `KYC ${vars.decision}: ${vars.account_name}`,
      `<p>The KYC review for <strong>${vars.account_name}</strong> is now <strong>${vars.decision}</strong>.</p>${vars.notes ? `<p style="background:#f5f5f5;padding:12px;border-radius:6px"><em>${vars.notes}</em></p>` : ''}<p><a href="${vars.account_url}">View account →</a></p>`,
      `KYC ${vars.decision}: ${vars.account_name}. ${vars.notes ?? ''}\n${vars.account_url}`
    ),
  'design-ready': (vars: { opportunity_name: string; design_url: string }) =>
    wrap(
      'Design ready for client presentation',
      `<p>The design files for <strong>${vars.opportunity_name}</strong> are ready to share with the client.</p><p><a href="${vars.design_url}">Open opportunity →</a></p>`,
      `Designs ready for ${vars.opportunity_name}: ${vars.design_url}`
    ),
  'bom-portal-link': (vars: { project_name: string; portal_url: string; valid_until: string }) =>
    wrap(
      'Your BOM is ready for review',
      `<p>The Bill of Materials for <strong>${vars.project_name}</strong> is ready for your review and signature.</p><p><a href="${vars.portal_url}" style="display:inline-block;padding:10px 16px;background:#E07B2A;color:white;text-decoration:none;border-radius:6px">Review &amp; sign BOM →</a></p><p style="font-size:12px;color:#737373">This link is valid until ${vars.valid_until}.</p>`,
      `Your BOM for ${vars.project_name} is ready. Sign at: ${vars.portal_url} (valid until ${vars.valid_until})`
    ),
  'bom-signed': (vars: { project_name: string; tcv_php: string; project_url: string }) =>
    wrap(
      'Client signed the BOM',
      `<p>The client has signed the BOM for <strong>${vars.project_name}</strong> (TCV ₱${vars.tcv_php}).</p><p><a href="${vars.project_url}">Open project →</a></p>`,
      `Client signed BOM for ${vars.project_name}. TCV: ₱${vars.tcv_php}. ${vars.project_url}`
    ),
  'rfq-dispatch': (vars: { project_name: string; line_count: number; rfq_url: string }) =>
    wrap(
      'RFQs ready for supplier outreach',
      `<p>${vars.line_count} line items are flagged for RFQ on <strong>${vars.project_name}</strong>.</p><p><a href="${vars.rfq_url}">Open procurement →</a></p>`,
      `${vars.line_count} RFQs ready for ${vars.project_name}. ${vars.rfq_url}`
    ),
  'po-issued': (vars: { po_number: string; total_php: string; supplier_name: string; po_pdf_url?: string }) =>
    wrap(
      `Purchase order ${vars.po_number}`,
      `<p>Dear ${vars.supplier_name},</p><p>Please find attached purchase order <strong>${vars.po_number}</strong> for ₱${vars.total_php}.</p>${vars.po_pdf_url ? `<p><a href="${vars.po_pdf_url}">Download PO PDF →</a></p>` : ''}`,
      `PO ${vars.po_number} for ₱${vars.total_php} issued to ${vars.supplier_name}. ${vars.po_pdf_url ?? ''}`
    ),
  'ticket-ack': (vars: { ticket_number: string; description: string }) =>
    wrap(
      `Warranty ticket ${vars.ticket_number} received`,
      `<p>We've received your warranty request. Our CX team will respond within 24 hours.</p><p><strong>Reference:</strong> ${vars.ticket_number}</p><p><strong>Issue:</strong> ${vars.description}</p>`,
      `Warranty ticket ${vars.ticket_number} received. We'll respond within 24h. Issue: ${vars.description}`
    ),
  'ticket-schedule': (vars: { ticket_number: string; scheduled_for: string; confirm_url: string }) =>
    wrap(
      `Repair scheduled — ticket ${vars.ticket_number}`,
      `<p>We've scheduled the repair for <strong>${vars.scheduled_for}</strong>.</p><p><a href="${vars.confirm_url}">Confirm or reschedule →</a></p>`,
      `Repair for ticket ${vars.ticket_number} scheduled for ${vars.scheduled_for}. Confirm: ${vars.confirm_url}`
    ),
  'cnps-survey': (vars: { ticket_number: string; survey_url: string }) =>
    wrap(
      'How did we do?',
      `<p>Your warranty ticket <strong>${vars.ticket_number}</strong> was recently closed. Could you rate our service?</p><p><a href="${vars.survey_url}" style="display:inline-block;padding:10px 16px;background:#0F2D4A;color:white;text-decoration:none;border-radius:6px">Rate us (takes 30s) →</a></p>`,
      `Please rate our service for ticket ${vars.ticket_number}: ${vars.survey_url}`
    ),
  'sla-breach': (vars: { entity_label: string; sla_label: string; project_name?: string; link_url: string }) =>
    wrap(
      `SLA breached: ${vars.sla_label}`,
      `<p>SLA <strong>${vars.sla_label}</strong> has breached on <strong>${vars.entity_label}</strong>${vars.project_name ? ` (${vars.project_name})` : ''}.</p><p><a href="${vars.link_url}">Open →</a></p>`,
      `SLA breach: ${vars.sla_label} on ${vars.entity_label}. ${vars.link_url}`
    ),
} as const

export type TemplateBuilders = typeof templates
