'use server'

/**
 * Public CNPS portal actions (REFACTOR.md US-WA-003).
 *
 * 1. Verify token → row.
 * 2. Stamp score + comment + responded_at.
 * 3. Recompute rolling account CNPS as avg(score) × 10 across all responded.
 * 4. Score < 7 alerts CX team in-app.
 * 5. Audit (actor_id null — public portal).
 */

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { db } from '@third-code-erp/database'
import {
  cnpsSurveys,
  warrantyTickets,
  accounts,
} from '@third-code-erp/database/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function intOpt(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export async function submitCnpsRating(
  token: string,
  formData: FormData
): Promise<void> {
  const tokenHash = hashToken(token)

  const [row] = await db
    .select({
      survey_id: cnpsSurveys.id,
      tenant_id: cnpsSurveys.tenant_id,
      ticket_id: cnpsSurveys.ticket_id,
      account_id: cnpsSurveys.account_id,
      responded_at: cnpsSurveys.responded_at,
      ticket_number: warrantyTickets.ticket_number,
    })
    .from(cnpsSurveys)
    .innerJoin(
      warrantyTickets,
      and(
        eq(warrantyTickets.id, cnpsSurveys.ticket_id),
        eq(warrantyTickets.tenant_id, cnpsSurveys.tenant_id)
      )
    )
    .where(eq(cnpsSurveys.response_token_hash, tokenHash))
    .limit(1)

  if (!row || row.responded_at) {
    redirect(`/portal/cnps/${token}?ok=1`)
  }

  const rawScore = intOpt(formData.get('score'))
  if (rawScore === null || rawScore < 0 || rawScore > 10) {
    redirect(`/portal/cnps/${token}`)
  }

  const comment = typeof formData.get('comment') === 'string'
    ? (formData.get('comment') as string).trim().slice(0, 2000)
    : ''

  const now = new Date()

  // 2. Record response.
  await db
    .update(cnpsSurveys)
    .set({
      score: rawScore,
      comment: comment || null,
      responded_at: now,
    })
    .where(
      and(
        eq(cnpsSurveys.id, row.survey_id),
        eq(cnpsSurveys.tenant_id, row.tenant_id)
      )
    )

  // 3. Recompute rolling account CNPS (avg × 10).
  if (row.account_id) {
    const responses = await db
      .select({ score: cnpsSurveys.score })
      .from(cnpsSurveys)
      .where(
        and(
          eq(cnpsSurveys.tenant_id, row.tenant_id),
          eq(cnpsSurveys.account_id, row.account_id),
          isNotNull(cnpsSurveys.responded_at)
        )
      )

    const validScores = responses
      .map((r) => r.score)
      .filter((s): s is number => typeof s === 'number')

    if (validScores.length > 0) {
      const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length
      const rolling = (avg * 10).toFixed(1)
      await db
        .update(accounts)
        .set({ cnps_score_x10: rolling, updated_at: now })
        .where(
          and(eq(accounts.id, row.account_id), eq(accounts.tenant_id, row.tenant_id))
        )
    }
  }

  // 4. Low score alert.
  if (rawScore < 7) {
    await notifyRoles({
      tenantId: row.tenant_id,
      recipientRoles: ['cx'],
      subject: `Low CNPS score (${rawScore}/10) on ticket ${row.ticket_number}`,
      body: comment ? `Comment: ${comment.slice(0, 200)}` : 'No comment provided.',
      linkUrl: `/warranty/${row.ticket_id}`,
    })
  }

  // 5. Audit.
  try {
    const diff = { score: rawScore, comment_len: comment.length }
    await writeAuditLog({
      tenantId: row.tenant_id,
      actorId: null,
      entityType: 'cnps_survey',
      entityId: row.survey_id,
      action: 'update',
      diff,
    })
  } catch {
    // non-blocking
  }

  redirect(`/portal/cnps/${token}?ok=1`)
}
