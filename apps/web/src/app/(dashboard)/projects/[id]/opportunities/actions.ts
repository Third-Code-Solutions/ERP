'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities, projects } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { STAGE_PROBABILITY } from '@third-code-erp/shared-types'
import { weightedTCV } from '@third-code-erp/shared-types/bom'
import { writeAuditLog, computeDiff } from '@/lib/audit'

const createOpportunitySchema = z.object({
  project_id: z.string().uuid(),
  stage: z.enum([
    'opportunity_creation', 'scoping', 'bom_submission',
    'resubmission', 'negotiation', 'closed_won', 'closed_lost',
  ]).default('opportunity_creation'),
  tcv_cents: z.coerce.number().int().min(0).default(0),
  // GP can legitimately be negative on a losing project. Don't clamp at 0.
  gp_cents: z.coerce.number().int().default(0),
  area_sqm: z.coerce.number().int().positive().optional(),
  opportunity_type: z.string().max(100).optional(),
  closing_date: z.string().datetime({ offset: true }).optional(),
  remarks: z.string().max(5000).optional(),
})

const transitionSchema = z.object({
  opportunity_id: z.string().uuid(),
  new_stage: z.enum([
    'opportunity_creation', 'scoping', 'bom_submission',
    'resubmission', 'negotiation', 'closed_won', 'closed_lost',
  ]),
  tcv_cents: z.coerce.number().int().min(0).optional(),
  gp_cents: z.coerce.number().int().optional(),
  closing_date: z.string().datetime({ offset: true }).optional(),
})

export async function createOpportunity(formData: FormData) {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'opportunity.create')) return { error: 'Forbidden' }

  const input = createOpportunitySchema.parse({
    project_id: formData.get('project_id'),
    stage: formData.get('stage') || 'opportunity_creation',
    tcv_cents: formData.get('tcv_cents') || 0,
    gp_cents: formData.get('gp_cents') || 0,
    area_sqm: formData.get('area_sqm') || undefined,
    opportunity_type: formData.get('opportunity_type') || undefined,
    closing_date: formData.get('closing_date') || undefined,
    remarks: formData.get('remarks') || undefined,
  })

  const probability = STAGE_PROBABILITY[input.stage as keyof typeof STAGE_PROBABILITY] ?? 0
  const weightedTcv = weightedTCV(input.tcv_cents, probability)

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.project_id), eq(projects.tenant_id, profile.tenantId)))
  if (!project) throw new Error('Project not found')

  const [inserted] = await db
    .insert(opportunities)
    .values({
      tenant_id: profile.tenantId,
      project_id: input.project_id,
      rep_id: profile.user.id,
      stage: input.stage,
      tcv_cents: input.tcv_cents,
      gp_cents: input.gp_cents,
      area_sqm: input.area_sqm,
      opportunity_type: input.opportunity_type,
      remarks: input.remarks,
      closing_date: input.closing_date ? new Date(input.closing_date) : null,
      probability,
      weighted_tcv_cents: weightedTcv,
    })
    .returning()

  if (inserted) {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'opportunities',
      entityId: inserted.id,
      action: 'create',
      diff: { created: inserted },
    })
  }

  revalidatePath(`/projects/${input.project_id}`)
  revalidatePath('/pipeline/conversion')
  revalidatePath('/dashboard')
}

export async function transitionStage(formData: FormData) {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'opportunity.advance_stage')) return { error: 'Forbidden' }

  const input = transitionSchema.parse({
    opportunity_id: formData.get('opportunity_id'),
    new_stage: formData.get('new_stage'),
    tcv_cents: formData.get('tcv_cents') || undefined,
    gp_cents: formData.get('gp_cents') || undefined,
    closing_date: formData.get('closing_date') || undefined,
  })

  const [existing] = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, input.opportunity_id),
        eq(opportunities.tenant_id, profile.tenantId)
      )
    )

  if (!existing) throw new Error('Opportunity not found')

  const probability = STAGE_PROBABILITY[input.new_stage as keyof typeof STAGE_PROBABILITY] ?? existing.probability
  const newTcv = input.tcv_cents ?? existing.tcv_cents
  const newGp = input.gp_cents ?? existing.gp_cents
  const weightedTcv = weightedTCV(newTcv, probability)

  const updateData = {
    stage: input.new_stage,
    probability,
    tcv_cents: newTcv,
    gp_cents: newGp,
    weighted_tcv_cents: weightedTcv,
    closing_date: input.closing_date ? new Date(input.closing_date) : existing.closing_date,
    updated_at: new Date(),
  }

  await db
    .update(opportunities)
    .set(updateData)
    .where(
      and(
        eq(opportunities.id, input.opportunity_id),
        eq(opportunities.tenant_id, profile.tenantId),
      ),
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'opportunities',
    entityId: existing.id,
    action: 'stage_change',
    diff: computeDiff(
      { stage: existing.stage, tcv_cents: existing.tcv_cents, gp_cents: existing.gp_cents },
      { stage: input.new_stage, tcv_cents: newTcv, gp_cents: newGp }
    ),
  })

  revalidatePath(`/projects/${existing.project_id}`)
  revalidatePath('/pipeline/conversion')
  revalidatePath('/dashboard')
}
