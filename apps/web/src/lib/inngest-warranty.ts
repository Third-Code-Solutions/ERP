/**
 * CNPS survey dispatch (REFACTOR.md US-WA-003).
 *
 * Two functions:
 *   - dispatchCnpsSurveys: hourly cron. Sweeps closed tickets with no survey
 *     row yet that closed ≥ 48h ago, mints a per-survey token, emails the
 *     client.
 *   - onCnpsSurveyScheduled: single-ticket handler triggered by an Inngest
 *     event emitted at close time. Same body — but waits 48h via step.sleep.
 *
 * The main thread is expected to register these in
 * apps/web/src/app/api/webhooks/inngest/route.ts.
 */

import { randomBytes, createHash } from 'node:crypto'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  warrantyTickets,
  cnpsSurveys,
} from '@third-code-erp/database/schema'
import { notifyExternalEmail } from '@/lib/operations/notifications'
import { inngest } from '@/lib/inngest'

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
  )
}

interface InngestStep {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  sleep?: (name: string, until: string | number) => Promise<void>
  sleepUntil?: (name: string, until: Date | string) => Promise<void>
}

/**
 * Mint a per-survey token, insert the cnps_surveys row (sent_at=NOW), then
 * send the email. Idempotent: if a row already exists with sent_at set, no-op.
 */
async function dispatchOneSurvey(ticketId: string): Promise<{ sent: boolean; reason?: string }> {
  const [t] = await db
    .select({
      id: warrantyTickets.id,
      tenant_id: warrantyTickets.tenant_id,
      account_id: warrantyTickets.account_id,
      ticket_number: warrantyTickets.ticket_number,
      status: warrantyTickets.status,
      closed_at: warrantyTickets.closed_at,
      submitted_by_email: warrantyTickets.submitted_by_email,
    })
    .from(warrantyTickets)
    .where(eq(warrantyTickets.id, ticketId))
    .limit(1)

  if (!t) return { sent: false, reason: 'ticket-not-found' }
  if (t.status !== 'closed') return { sent: false, reason: 'not-closed' }
  if (!t.submitted_by_email) return { sent: false, reason: 'no-email' }

  // Skip if a survey already went out.
  const [existing] = await db
    .select({ id: cnpsSurveys.id, sent_at: cnpsSurveys.sent_at })
    .from(cnpsSurveys)
    .where(eq(cnpsSurveys.ticket_id, ticketId))
    .limit(1)
  if (existing?.sent_at) return { sent: false, reason: 'already-sent' }

  const plaintext = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(plaintext).digest('hex')
  const now = new Date()

  if (existing) {
    await db
      .update(cnpsSurveys)
      .set({ sent_at: now, response_token_hash: tokenHash })
      .where(eq(cnpsSurveys.id, existing.id))
  } else {
    await db.insert(cnpsSurveys).values({
      tenant_id: t.tenant_id,
      ticket_id: t.id,
      account_id: t.account_id ?? null,
      sent_at: now,
      response_token_hash: tokenHash,
    })
  }

  await notifyExternalEmail({
    tenantId: t.tenant_id,
    recipientEmail: t.submitted_by_email,
    subject: `How did we do? Ticket ${t.ticket_number}`,
    templateId: 'cnps-survey',
    templateVars: {
      ticket_number: t.ticket_number,
      survey_url: `${siteBase()}/portal/cnps/${plaintext}`,
    },
  })

  return { sent: true }
}

/**
 * Hourly cron. Finds closed tickets that closed ≥ 48h ago with no survey yet.
 *
 * Implemented as a Drizzle query rather than raw SQL so we keep typing.
 * Uses a left-join + NULL filter to express NOT EXISTS.
 */
export const dispatchCnpsSurveys = inngest.createFunction(
  {
    id: 'dispatch-cnps-surveys',
    name: 'Dispatch CNPS Surveys (48h after ticket close)',
    triggers: [{ cron: '0 */1 * * *' as const }],
  },
  async ({ step }: { step: InngestStep }) => {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const candidates = await step.run('find-due-tickets', async () => {
      const rows = await db
        .select({
          id: warrantyTickets.id,
          existing_sent_at: cnpsSurveys.sent_at,
        })
        .from(warrantyTickets)
        .leftJoin(cnpsSurveys, eq(cnpsSurveys.ticket_id, warrantyTickets.id))
        .where(
          and(
            eq(warrantyTickets.status, 'closed'),
            lte(warrantyTickets.closed_at, cutoff),
            or(isNull(cnpsSurveys.id), isNull(cnpsSurveys.sent_at))
          )
        )
        .limit(200)
      // De-dupe in case multiple rows joined.
      const seen = new Set<string>()
      return rows.filter((r) => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    })

    let sentCount = 0
    for (const c of candidates) {
      const r = await step.run(`send-${c.id}`, async () => dispatchOneSurvey(c.id))
      if (r.sent) sentCount += 1
    }

    return { swept: candidates.length, sent: sentCount }
  }
)

/**
 * Event handler triggered when a ticket is closed. Sleeps 48h then dispatches
 * once. Belt-and-braces with the cron — the cron is the safety net.
 */
export const onCnpsSurveyScheduled = inngest.createFunction(
  {
    id: 'cnps-survey-scheduled',
    name: 'CNPS Survey Scheduled (48h post-close)',
    triggers: [{ event: 'cnps/survey.scheduled' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { ticketId: string; tenantId: string } }
    step: InngestStep
  }) => {
    const { ticketId } = event.data
    if (step.sleep) {
      await step.sleep('wait-48h', '48h')
    } else if (step.sleepUntil) {
      const until = new Date(Date.now() + 48 * 60 * 60 * 1000)
      await step.sleepUntil('wait-48h', until)
    }
    return step.run('send', async () => dispatchOneSurvey(ticketId))
  }
)

// Re-export inngest so the main route file can import everything from one
// place if it prefers (it currently imports from '@/lib/inngest').
export { inngest }
