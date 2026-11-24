import { pgRest, pgSelect } from '../_shared/email.ts'

export interface SurveyRow {
  tenant_id: string
  ticket_id: string
  account_id: string | null
  response_token_hash: string
}

type Select = <T>(table: string, query: string) => Promise<T[]>

type Rest = (args: {
  path: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
  prefer: string
}) => Promise<unknown>

// Ticket ids per lookup: each id is 37 characters of query string, so 100 keep
// the URL near 4 KB, well under gateway limits, however many tickets closed.
export const SURVEY_LOOKUP_CHUNK = 100

/**
 * The tickets that already have a survey, sent or pending, read in chunks of
 * SURVEY_LOOKUP_CHUNK ids so the `in.(...)` filter never outgrows the URL.
 */
export async function ticketsWithSurvey(
  ticketIds: string[],
  select: Select = pgSelect
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let start = 0; start < ticketIds.length; start += SURVEY_LOOKUP_CHUNK) {
    const ids = ticketIds.slice(start, start + SURVEY_LOOKUP_CHUNK)
    const rows = await select<{ ticket_id: string }>('cnps_surveys', `ticket_id=in.(${ids.join(',')})&select=ticket_id`)
    for (const row of rows) found.add(row.ticket_id)
  }
  return found
}

/**
 * Insert the ticket's pending survey (sent_at null) unless the ticket already
 * has one. ux_cnps_surveys_tenant_ticket makes a concurrent sender's insert a
 * no-op, so null means another sender owns this survey and no email may go out.
 */
export async function insertSurveyOnce(row: SurveyRow, rest: Rest = pgRest): Promise<string | null> {
  const inserted = await rest({
    path: 'cnps_surveys?on_conflict=tenant_id,ticket_id&select=id',
    method: 'POST',
    body: { ...row, sent_at: null },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  const first = Array.isArray(inserted) ? (inserted[0] as { id?: unknown } | undefined) : undefined
  return typeof first?.id === 'string' ? first.id : null
}

/** Stamp sent_at once the provider accepted the email. */
export async function markSurveySent(
  surveyId: string,
  tenantId: string,
  sentAt: string,
  rest: Rest = pgRest
): Promise<void> {
  await rest({
    path: `cnps_surveys?id=eq.${surveyId}&tenant_id=eq.${tenantId}`,
    method: 'PATCH',
    body: { sent_at: sentAt },
    prefer: 'return=minimal',
  })
}

export interface SurveySteps {
  insertSurvey: (row: SurveyRow) => Promise<string | null>
  send: () => Promise<{ ok: boolean; skipped?: boolean; error?: string }>
  markSent: (surveyId: string) => Promise<void>
  /** Waits between stamp attempts; tests pass a no-op. */
  pause?: (ms: number) => Promise<void>
}

// An unstamped survey looks unsent: 15 minutes later the Inngest cron would
// mint a new link and email the client again. So retry the stamp first.
export const STAMP_ATTEMPTS = 3
const STAMP_RETRY_MS = 500

export type SurveyOutcome =
  | { outcome: 'sent' }
  | { outcome: 'skipped_existing' }
  | { outcome: 'not_delivered'; error: string }

/**
 * One ticket: claim the survey row, send, then stamp sent_at, retrying the
 * stamp up to STAMP_ATTEMPTS times. A send that fails or is skipped (no
 * provider configured) leaves the row pending, and the web app's Inngest cron
 * retries it.
 */
export async function sendTicketSurvey(row: SurveyRow, steps: SurveySteps): Promise<SurveyOutcome> {
  const surveyId = await steps.insertSurvey(row)
  if (!surveyId) return { outcome: 'skipped_existing' }

  const delivery = await steps.send()
  if (!delivery.ok || delivery.skipped) {
    return {
      outcome: 'not_delivered',
      error: delivery.error ?? (delivery.skipped ? 'email provider not configured' : 'email not delivered'),
    }
  }

  const pause = steps.pause ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  for (let attempt = 1; ; attempt += 1) {
    try {
      await steps.markSent(surveyId)
      return { outcome: 'sent' }
    } catch (error) {
      if (attempt === STAMP_ATTEMPTS) throw error
      await pause(STAMP_RETRY_MS * attempt)
    }
  }
}
