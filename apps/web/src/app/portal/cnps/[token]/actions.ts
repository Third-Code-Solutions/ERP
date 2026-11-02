'use server'

import { createHash, randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { db } from '@third-code-erp/database'
import { accounts, cnpsSurveys, tenants, warrantyTickets } from '@third-code-erp/database/schema'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

const ratingSchema = z.object({
  score: z.string().regex(/^(?:[0-9]|10)$/).transform(Number),
  comment: z.string().trim().transform(value => value.slice(0, 2000)),
})

export async function submitCnpsRating(token: string, formData: FormData): Promise<void> {
  const traceId = randomUUID()
  const parsed = ratingSchema.safeParse({ score: formData.get('score'), comment: formData.get('comment') ?? '' })
  if (!parsed.success) {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: null, actor_id: null, action: 'cnps.submit', outcome: 'invalid' }))
    redirect(`/portal/cnps/${token}?error=invalid`)
  }
  const { score, comment } = parsed.data
  const tokenHash = createHash('sha256').update(token).digest('hex')
  let tenantId: string | null = null

  const result = await db.transaction(async tx => {
    // Public bearer token supplies identity; lock the tenant against suspension until commit.
    const [row] = await tx
      .select({
        survey_id: cnpsSurveys.id,
        tenant_id: cnpsSurveys.tenant_id,
        ticket_id: cnpsSurveys.ticket_id,
        account_id: cnpsSurveys.account_id,
        responded_at: cnpsSurveys.responded_at,
        ticket_number: warrantyTickets.ticket_number,
      })
      .from(cnpsSurveys)
      .innerJoin(tenants, eq(tenants.id, cnpsSurveys.tenant_id))
      .innerJoin(warrantyTickets, and(eq(warrantyTickets.id, cnpsSurveys.ticket_id), eq(warrantyTickets.tenant_id, cnpsSurveys.tenant_id)))
      .where(and(eq(cnpsSurveys.response_token_hash, tokenHash), eq(tenants.status, 'active')))
      .limit(1)
      .for('share', { of: tenants })

    if (!row) return { status: 'unavailable' } as const
    tenantId = row.tenant_id
    if (row.responded_at) return { status: 'already_responded' } as const

    // Lock before the response write so concurrent surveys cannot publish a stale account average.
    if (row.account_id) {
      const [account] = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.id, row.account_id), eq(accounts.tenant_id, row.tenant_id)))
        .for('update')
      if (!account) return { status: 'unavailable' } as const
    }

    const now = new Date()
    const [saved] = await tx.update(cnpsSurveys)
      .set({ score, comment: comment || null, responded_at: now })
      .where(and(eq(cnpsSurveys.id, row.survey_id), eq(cnpsSurveys.tenant_id, row.tenant_id), isNull(cnpsSurveys.responded_at)))
      .returning({ id: cnpsSurveys.id })
    if (!saved) return { status: 'already_responded' } as const

    if (row.account_id) {
      const responses = await tx.select({ score: cnpsSurveys.score }).from(cnpsSurveys)
        .where(and(eq(cnpsSurveys.tenant_id, row.tenant_id), eq(cnpsSurveys.account_id, row.account_id), isNotNull(cnpsSurveys.responded_at)))
      const validScores = responses.map(response => response.score).filter((value): value is number => typeof value === 'number')
      const rolling = (validScores.reduce((sum, value) => sum + value, 0) / validScores.length * 10).toFixed(1)
      await tx.update(accounts).set({ cnps_score_x10: rolling, updated_at: now })
        .where(and(eq(accounts.id, row.account_id), eq(accounts.tenant_id, row.tenant_id)))
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: row.tenant_id, actorId: null, entityType: 'cnps_survey', entityId: row.survey_id,
      action: 'update', diff: { score, comment_len: comment.length },
    })
    return { status: 'saved', row } as const
  }).catch(error => {
    console.error(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: null, action: 'cnps.submit', outcome: 'failed' }))
    throw error
  })

  console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: null, action: 'cnps.submit', outcome: result.status }))
  if (result.status === 'unavailable') redirect(`/portal/cnps/${token}?error=unavailable`)

  if (result.status === 'saved' && score < 7) {
    try {
      await notifyRoles({
        tenantId: result.row.tenant_id,
        recipientRoles: ['cx'],
        subject: `Low CNPS score (${score}/10) on ticket ${result.row.ticket_number}`,
        body: comment ? `Comment: ${comment.slice(0, 200)}` : 'No comment provided.',
        linkUrl: `/warranty/${result.row.ticket_id}`,
      })
    } catch {
      // The audited response already committed; a notification failure must not invite resubmission.
      console.error(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: null, action: 'cnps.notify', outcome: 'failed' }))
    }
  }
  redirect(`/portal/cnps/${token}`)
}
