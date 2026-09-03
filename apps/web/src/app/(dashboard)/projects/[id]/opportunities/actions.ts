'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities, projects } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  opportunityStageValues,
  STAGE_PROBABILITY,
  STAGE_TRANSITIONS,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { weightedTCV } from '@third-code-erp/shared-types/bom'
import { writeAuditLog } from '@/lib/audit'
import {
  opportunityStageWritesUseCoreApi,
  transitionOpportunityStageThroughCoreApi,
} from '@/lib/erp-core-client'

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
  project_id: z.string().uuid(),
  new_stage: z.enum(opportunityStageValues),
  reason: z.string().trim().max(1000).optional(),
  tcv_cents: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  gp_cents: z.coerce
    .number()
    .int()
    .min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  closing_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      return (
        !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
      )
    })
    .transform((value) => `${value}T00:00:00+08:00`)
    .optional(),
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

export async function transitionStage(
  formData: FormData
): Promise<{ error?: string; projectId?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'opportunity.advance_stage')) return { error: 'Forbidden' }

  const parsed = transitionSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    project_id: formData.get('project_id'),
    new_stage: formData.get('new_stage'),
    reason: formValueOrUndefined(formData.get('reason')),
    tcv_cents: formValueOrUndefined(formData.get('tcv_cents')),
    gp_cents: formValueOrUndefined(formData.get('gp_cents')),
    closing_date: formValueOrUndefined(formData.get('closing_date')),
  })
  if (!parsed.success) return { error: 'Invalid Opportunity stage transition.' }
  const input = parsed.data

  let coreSelected: boolean
  try {
    coreSelected = opportunityStageWritesUseCoreApi(profile.tenantId)
  } catch {
    return {
      error:
        'Opportunity stage transition could not be selected. No Opportunity stage transition was committed.',
    }
  }
  if (!coreSelected) {
    return { error: 'Opportunity stage transition is not enabled for this tenant.' }
  }

  const command = {
    newStage: input.new_stage,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.tcv_cents !== undefined ? { tcvCents: input.tcv_cents } : {}),
    ...(input.gp_cents !== undefined ? { gpCents: input.gp_cents } : {}),
    ...(input.closing_date ? { closingDate: input.closing_date } : {}),
  }

  let transition: Awaited<
    ReturnType<typeof transitionOpportunityStageThroughCoreApi>
  >
  try {
    transition = await transitionOpportunityStageThroughCoreApi(
      input.opportunity_id,
      command,
      projectStageTransitionIdempotencyKey(input.opportunity_id, command)
    )
  } catch {
    return {
      error:
        'ERP Core API is unavailable. No Opportunity stage transition was committed.',
    }
  }
  if (!transition.ok) {
    return {
      error:
        transition.error ?? 'Opportunity stage transition was not completed.',
    }
  }

  const { data } = transition
  const wonTransition =
    input.new_stage === 'won' || input.new_stage === 'closed_won'
  const identityIsValid =
    data?.opportunityId === input.opportunity_id &&
    data.tenantId === profile.tenantId &&
    data.toStage === input.new_stage
  const edgeIsValid =
    data !== undefined &&
    STAGE_TRANSITIONS[data.fromStage].includes(input.new_stage)
  if (!data || !identityIsValid || !edgeIsValid) {
    return {
      error: wonTransition
        ? 'ERP Core API returned an invalid Won-to-Project transition result.'
        : 'ERP Core API returned an invalid Opportunity stage transition result.',
    }
  }

  if (wonTransition) {
    if (
      !data.convertedToProject ||
      !data.projectId ||
      !data.checklistId
    ) {
      return {
        error: 'ERP Core API returned an invalid Won-to-Project transition result.',
      }
    }
    revalidateProjectOpportunityPaths(input.project_id)
    revalidatePath(`/projects/${data.projectId}`)
    return { projectId: data.projectId }
  }
  if (
    data.convertedToProject ||
    data.projectId !== null ||
    data.checklistId !== null
  ) {
    return {
      error:
        'ERP Core API returned an invalid Opportunity stage transition result.',
    }
  }
  revalidateProjectOpportunityPaths(input.project_id)
  return {}
}

function projectStageTransitionIdempotencyKey(
  opportunityId: string,
  command: {
    newStage: OpportunityStage
    reason?: string
    tcvCents?: number
    gpCents?: number
    closingDate?: string
  }
): string {
  const commandDigest = createHash('sha256')
    .update(JSON.stringify({ opportunityId, ...command }), 'utf8')
    .digest('hex')
  return `project-opportunity-stage-${commandDigest}`
}

function revalidateProjectOpportunityPaths(projectId: string): void {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/pipeline/board')
  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/conversion')
  revalidatePath('/dashboard')
}

function formValueOrUndefined(
  value: FormDataEntryValue | null
): FormDataEntryValue | undefined {
  return typeof value === 'string' && value.trim().length === 0
    ? undefined
    : value ?? undefined
}
