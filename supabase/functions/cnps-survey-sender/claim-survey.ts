import { pgRest } from '../_shared/email.ts'

export interface SurveyRow {
  tenant_id: string
  ticket_id: string
  account_id: string | null
  sent_at: string
  response_token_hash: string
}

/**
 * Insert the ticket's survey row unless the ticket already has one.
 * ux_cnps_surveys_tenant_ticket makes a concurrent sender's insert a no-op,
 * so false means another sender owns this survey and no email may go out.
 */
export async function insertSurveyOnce(
  row: SurveyRow,
  rest: (args: { path: string; method: 'POST'; body: SurveyRow; prefer: string }) => Promise<unknown> = pgRest
): Promise<boolean> {
  const inserted = await rest({
    path: 'cnps_surveys?on_conflict=tenant_id,ticket_id&select=id',
    method: 'POST',
    body: row,
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  return Array.isArray(inserted) && inserted.length > 0
}
