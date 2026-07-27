// CNPS Survey Sender — runs every hour.
//
// Finds warranty tickets closed > 48h ago that don't yet have a sent CNPS
// survey. For each: generate a random token, hash it, INSERT a
// `cnps_surveys` row with sent_at = now(), and email the submitter the
// survey link.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { pgInsert, pgSelect, sendEmail } from '../_shared/email.ts'

interface TicketRow {
  id: string
  tenant_id: string
  project_id: string
  account_id: string | null
  ticket_number: string
  submitted_by_name: string | null
  submitted_by_email: string | null
  closed_at: string
}

interface ExistingSurveyRow {
  ticket_id: string
}

interface RunSummary {
  processed: number
  sent: number
  skipped_no_email: number
  errors: Array<{ id: string; error: string }>
}

function randomTokenBase64Url(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen)
  crypto.getRandomValues(bytes)
  // Manual base64url so we don't pull in extra deps.
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

function buildSurveyEmail(args: {
  ticketNumber: string
  recipientName: string | null
  surveyUrl: string
}): { subject: string; html: string; text: string } {
  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hi,'
  const subject = `How did we do? — Service ticket ${args.ticketNumber}`
  const text = [
    greeting,
    ``,
    `Thanks for letting us close out service ticket ${args.ticketNumber}. We would love a quick rating on how the experience went — it takes under a minute.`,
    ``,
    `Open the survey: ${args.surveyUrl}`,
    ``,
    `Thank you,`,
    `Third Code ERP Customer Experience`,
  ].join('\n')
  const html = `
    <p>${greeting}</p>
    <p>Thanks for letting us close out service ticket <strong>${args.ticketNumber}</strong>. We would love a quick rating on how the experience went — it takes under a minute.</p>
    <p><a href="${args.surveyUrl}">Open the survey</a></p>
    <p>Thank you,<br/>Third Code ERP Customer Experience</p>
  `.trim()
  return { subject, html, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const summary: RunSummary = {
    processed: 0,
    sent: 0,
    skipped_no_email: 0,
    errors: [],
  }
  const nowMs = Date.now()
  const fortyEightHoursAgoIso = new Date(nowMs - 48 * 3600 * 1000).toISOString()

  try {
    const closedTickets = await pgSelect<TicketRow>(
      'warranty_tickets',
      `status=eq.closed&closed_at=lt.${fortyEightHoursAgoIso}&select=id,tenant_id,project_id,account_id,ticket_number,submitted_by_name,submitted_by_email,closed_at`
    )

    if (closedTickets.length === 0) return jsonResponse(summary)

    const ticketIds = closedTickets.map((t) => t.id)
    const existing = await pgSelect<ExistingSurveyRow>(
      'cnps_surveys',
      `ticket_id=in.(${ticketIds.join(',')})&sent_at=not.is.null&select=ticket_id`
    )
    const alreadySent = new Set(existing.map((r) => r.ticket_id))

    const portalBase =
      Deno.env.get('PUBLIC_CNPS_BASE_URL') ??
      Deno.env.get('PUBLIC_APP_URL') ??
      'https://thirdcode-erp.vercel.app'

    for (const ticket of closedTickets) {
      summary.processed += 1
      if (alreadySent.has(ticket.id)) continue
      try {
        if (!ticket.submitted_by_email) {
          summary.skipped_no_email += 1
          continue
        }

        const token = randomTokenBase64Url(32)
        const tokenHash = await sha256Hex(token)
        const nowIso = new Date(nowMs).toISOString()

        await pgInsert('cnps_surveys', {
          tenant_id: ticket.tenant_id,
          ticket_id: ticket.id,
          account_id: ticket.account_id,
          sent_at: nowIso,
          response_token_hash: tokenHash,
        })

        const surveyUrl = `${portalBase.replace(/\/$/, '')}/cnps/respond?t=${token}`
        const { subject, html, text } = buildSurveyEmail({
          ticketNumber: ticket.ticket_number,
          recipientName: ticket.submitted_by_name,
          surveyUrl,
        })

        await sendEmail({
          to: ticket.submitted_by_email,
          subject,
          html,
          text,
        })

        await pgInsert('notifications', {
          tenant_id: ticket.tenant_id,
          recipient_email: ticket.submitted_by_email,
          channel: 'email',
          subject,
          body: text,
          sent_at: nowIso,
          payload: {
            template_id: 'cnps-survey',
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
          },
        })

        summary.sent += 1
      } catch (err) {
        summary.errors.push({
          id: ticket.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return jsonResponse(summary)
  } catch (err) {
    return jsonResponse(
      {
        ...summary,
        fatal: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
})
