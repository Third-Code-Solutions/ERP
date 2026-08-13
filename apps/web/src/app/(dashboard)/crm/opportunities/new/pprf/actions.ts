'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  opportunities,
  pprfSubmissions,
} from '@third-code-erp/database/schema'
import {
  accountIndustryValues,
  STAGE_PROBABILITY,
} from '@third-code-erp/shared-types'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { initializeOpportunityKycTracks, opportunityKycDueAt } from '@/lib/operations/opportunity-kyc'
import { notifyRoles } from '@/lib/operations/notifications'
import { startSlaClock } from '@/lib/operations/sla-clock'
import { pprfPayloadSchema } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/schemas'

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional()
  )

const pprfIntakeSchema = z
  .object({
    client_name: z.string().trim().min(2).max(255),
    industry: z.enum(accountIndustryValues).default('other'),
    billing_address: optionalText(1000),
    primary_email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
      z.string().email().optional()
    ),
    primary_phone: optionalText(64),
    tcv: z.coerce.number().finite().min(0).max(9_000_000_000),
    gp: z.coerce.number().finite().min(0).max(9_000_000_000),
    area_sqm: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() ? value : undefined),
      z.coerce.number().int().positive().optional()
    ),
    closing_date: optionalText(64),
    opportunity_type: optionalText(100),
    remarks: optionalText(5000),
  })
  .merge(pprfPayloadSchema)

function firstValidationError(error: z.ZodError): string {
  const first = error.errors[0]
  return `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`
}

function parseCents(pesos: number): number {
  return Math.round(pesos * 100)
}

function parseClosingDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** WO-11: create Client + Opportunity + PPRF + both review tracks atomically. */
export async function createPprfIntake(
  formData: FormData
): Promise<{ error?: string; accountId?: string; opportunityId?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'account.create') || !can(profile.role, 'pprf.submit')) {
    return { error: `Forbidden: role "${profile.role}" cannot submit a PPRF intake` }
  }

  const parsed = pprfIntakeSchema.safeParse({
    client_name: formData.get('client_name'),
    industry: formData.get('industry') || undefined,
    billing_address: formData.get('billing_address'),
    primary_email: formData.get('primary_email'),
    primary_phone: formData.get('primary_phone'),
    tcv: formData.get('tcv') || 0,
    gp: formData.get('gp') || 0,
    area_sqm: formData.get('area_sqm'),
    closing_date: formData.get('closing_date'),
    opportunity_type: formData.get('opportunity_type'),
    remarks: formData.get('remarks'),
    site_address: formData.get('site_address'),
    floor_area_sqm: formData.get('floor_area_sqm'),
    landlord_contact: formData.get('landlord_contact'),
    as_built_available: formData.get('as_built_available'),
    scope_notes: formData.get('scope_notes') || '',
    project_type: formData.get('project_type') || '',
    expected_start_date: formData.get('expected_start_date') || '',
    budget_range: formData.get('budget_range') || '',
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const dueAt = await opportunityKycDueAt(profile.tenantId)
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'pprf-intake:' + profile.tenantId + ':' + input.client_name.toLowerCase()}, 0))`
    )

    const [duplicate] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenant_id, profile.tenantId),
          eq(accounts.name, input.client_name)
        )
      )
      .limit(1)
    if (duplicate) {
      return { error: `An account named "${input.client_name}" already exists.` } as const
    }

    const now = new Date()
    const [account] = await tx
      .insert(accounts)
      .values({
        tenant_id: profile.tenantId,
        name: input.client_name,
        industry: input.industry,
        billing_address: input.billing_address,
        primary_email: input.primary_email,
        primary_phone: input.primary_phone,
        kyc_status: 'pending',
        created_by: profile.user.id,
      })
      .returning({ id: accounts.id })
    if (!account) throw new Error('PPRF intake account insert returned no row')

    const tcvCents = parseCents(input.tcv)
    const gpCents = parseCents(input.gp)
    const probability = STAGE_PROBABILITY.lead
    const [opportunity] = await tx
      .insert(opportunities)
      .values({
        tenant_id: profile.tenantId,
        account_id: account.id,
        rep_id: profile.user.id,
        stage: 'lead',
        tcv_cents: tcvCents,
        gp_cents: gpCents,
        probability,
        weighted_tcv_cents: Math.round((tcvCents * probability) / 100),
        closing_date: parseClosingDate(input.closing_date),
        area_sqm: input.area_sqm,
        opportunity_type: input.opportunity_type,
        remarks: input.remarks,
      })
      .returning({ id: opportunities.id })
    if (!opportunity) throw new Error('PPRF intake opportunity insert returned no row')

    const [pprf] = await tx
      .insert(pprfSubmissions)
      .values({
        tenant_id: profile.tenantId,
        opportunity_id: opportunity.id,
        version: 1,
        payload: {
          site_address: input.site_address,
          floor_area_sqm: input.floor_area_sqm,
          landlord_contact: input.landlord_contact,
          as_built_available: input.as_built_available,
          scope_notes: input.scope_notes,
          project_type: input.project_type,
          expected_start_date: input.expected_start_date,
          budget_range: input.budget_range,
        },
        submitted_at: now,
        submitted_by: profile.user.id,
      })
      .returning({ id: pprfSubmissions.id })
    if (!pprf) throw new Error('PPRF intake submission insert returned no row')

    await initializeOpportunityKycTracks(tx, {
      tenantId: profile.tenantId,
      opportunityId: opportunity.id,
      dueAt,
    })

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'account',
      entityId: account.id,
      action: 'create',
      diff: { name: input.client_name, source: 'pprf_intake', kyc_status: 'pending' },
    })
    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'opportunity',
      entityId: opportunity.id,
      action: 'create',
      diff: { account_id: account.id, stage: 'lead', source: 'pprf_intake' },
    })
    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'pprf_submission',
      entityId: pprf.id,
      action: 'create',
      diff: { version: 1, opportunity_id: opportunity.id, kyc_due_at: dueAt.toISOString() },
    })

    return { accountId: account.id, opportunityId: opportunity.id } as const
  })

  if ('error' in result) return result

  await startSlaClock({
    tenantId: profile.tenantId,
    entityType: 'opportunity',
    entityId: result.opportunityId,
    label: 'pprf.review',
  })
  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['finance', 'owner', 'admin'],
    subject: 'New PPRF intake requires dual-track review',
    body: `Client ${input.client_name} has a new PPRF. Financial Evaluation and Credit Investigation are due in two business days.`,
    linkUrl: `/crm/opportunities/${result.opportunityId}/proposal/pprf`,
  })

  revalidatePath('/crm/accounts')
  revalidatePath('/crm/kyc-queue')
  revalidatePath('/pipeline/board')
  return result
}
