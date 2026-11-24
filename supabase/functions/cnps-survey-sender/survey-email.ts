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

export function buildSurveyEmail(args: {
  ticketNumber: string
  recipientName: string | null
  surveyUrl: string
  companyName: string | null | undefined
}): { subject: string; html: string; text: string } {
  const company = tenantDisplayName(args.companyName)
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
    company,
  ].join('\n')
  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Thanks for letting us close out service ticket <strong>${escapeHtml(args.ticketNumber)}</strong>. We would love a quick rating on how the experience went — it takes under a minute.</p>
    <p><a href="${escapeHtml(args.surveyUrl)}">Open the survey</a></p>
    <p>Thank you,<br/>${escapeHtml(company)}</p>
  `.trim()
  return { subject, html, text }
}
