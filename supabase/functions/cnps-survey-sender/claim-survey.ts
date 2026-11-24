import { pgRest } from '../_shared/email.ts'

export interface SurveyRow {
  tenant_id: string
  ticket_id: string
  account_id: string | null
  response_token_hash: string
}

type Rest = (args: {
  path: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
  prefer: string
}) => Promise<unknown>

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
}

export type SurveyOutcome =
  | { outcome: 'sent' }
  | { outcome: 'skipped_existing' }
  | { outcome: 'not_delivered'; error: string }

/**
 * One ticket: claim the survey row, send, then stamp sent_at. A send that
 * fails or is skipped (no provider configured) leaves the row pending, and
 * the web app's Inngest cron retries it.
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

  await steps.markSent(surveyId)
  return { outcome: 'sent' }
}
