import { escapeHtml } from '../_shared/html.ts'
import { tenantDisplayName } from '../_shared/tenant-branding.ts'

type Select = <T>(table: string, query: string) => Promise<T[]>

/** Names of the tenants that closed these tickets, read in one query per run. */
export async function tenantNamesById(
  tenantIds: string[],
  select: Select
): Promise<Map<string, string | null>> {
  const ids = [...new Set(tenantIds)]
  if (ids.length === 0) return new Map()
  const rows = await select<{ id: string; name: string | null }>(
    'tenants',
    `id=in.(${ids.join(',')})&select=id,name`
  )
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** The web portal route that answers a survey: /portal/cnps/<token>. */
export function surveyUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/portal/cnps/${encodeURIComponent(token)}`
}

// The stored notification keeps the email's wording but never its link: the
// link carries the survey token, which only the email may hold.
export const SURVEY_LINK_REDACTED = '[link sent by email]'

/**
 * The survey email. `text` and `html` carry the real link and go to the
 * provider only; `storedText` is the same text with the link redacted, for
 * the notifications row.
 */
export function buildSurveyEmail(args: {
  ticketNumber: string
  recipientName: string | null
  surveyUrl: string
  companyName: string | null | undefined
}): { subject: string; html: string; text: string; storedText: string } {
  const company = tenantDisplayName(args.companyName)
  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hi,'
  const subject = `How did we do? — Service ticket ${args.ticketNumber}`
  const textWith = (link: string) => [
    greeting,
    ``,
    `Thanks for letting us close out service ticket ${args.ticketNumber}. We would love a quick rating on how the experience went — it takes under a minute.`,
    ``,
    `Open the survey: ${link}`,
    ``,
    `Thank you,`,
    company,
  ].join('\n')
  const text = textWith(args.surveyUrl)
  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Thanks for letting us close out service ticket <strong>${escapeHtml(args.ticketNumber)}</strong>. We would love a quick rating on how the experience went — it takes under a minute.</p>
    <p><a href="${escapeHtml(args.surveyUrl)}">Open the survey</a></p>
    <p>Thank you,<br/>${escapeHtml(company)}</p>
  `.trim()
  return { subject, html, text, storedText: textWith(SURVEY_LINK_REDACTED) }
}
