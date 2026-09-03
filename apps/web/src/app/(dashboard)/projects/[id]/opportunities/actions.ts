'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  opportunityCreationCommandSchema,
  opportunityCreationResultSchema,
  opportunityStageTransitionCommandSchema,
  opportunityStageValues,
  safeNonNegativeCentavosStringSchema,
  safeSignedCentavosStringSchema,
  STAGE_TRANSITIONS,
  type OpportunityCreationCommand,
  type OpportunityCreationResult,
  type OpportunityStageTransitionCommand,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createOpportunityThroughCoreApi,
  opportunityStageWritesUseCoreApi,
  transitionOpportunityStageThroughCoreApi,
} from '@/lib/erp-core-client'

type ActionResult = { error?: string; projectId?: string }
type UserProfile = Awaited<ReturnType<typeof requireUserProfile>>

const transitionSchema = z.object({
  opportunity_id: z.string().uuid(),
  project_id: z.string().uuid(),
  new_stage: z.enum(opportunityStageValues),
  reason: z.string().trim().max(1000).optional(),
  tcv_cents: safeNonNegativeCentavosStringSchema.optional(),
  gp_cents: safeSignedCentavosStringSchema.optional(),
  closing_date: z.string().datetime({ offset: true }).optional(),
})

export async function createOpportunity(
  formData: FormData
): Promise<ActionResult> {
  const traceId = randomUUID()
  let profile: UserProfile | undefined

  try {
    profile = await requireUserProfile()
    if (!can(profile.role, 'opportunity.create')) {
      return finishAction(traceId, profile, 'create', 'forbidden', {
        error: 'Forbidden',
      })
    }

    const closingDateInput = formStringOrUndefined(
      formData.get('closing_date')
    )
    const closingDate = closingDateInput
      ? normalizeManilaDateTime(closingDateInput)
      : undefined
    if (closingDateInput && !closingDate) {
      return finishAction(traceId, profile, 'create', 'invalid_input', {
        error: 'Invalid Opportunity creation.',
      })
    }

    const areaInput = formValueOrUndefined(formData.get('area_sqm'))
    const opportunityType = formStringOrUndefined(
      formData.get('opportunity_type')
    )
    const remarks = formStringOrUndefined(formData.get('remarks'))
    const parsed = opportunityCreationCommandSchema.safeParse({
      projectId: formData.get('project_id'),
      stage: formValueOrUndefined(formData.get('stage')),
      tcvCents: formValueOrUndefined(formData.get('tcv_cents')),
      gpCents: formValueOrUndefined(formData.get('gp_cents')),
      ...(closingDate ? { closingDate } : {}),
      ...(areaInput !== undefined
        ? {
            areaSqm:
              typeof areaInput === 'string' ? Number(areaInput) : areaInput,
          }
        : {}),
      ...(opportunityType ? { opportunityType } : {}),
      ...(remarks ? { remarks } : {}),
    })
    if (!parsed.success) {
      return finishAction(traceId, profile, 'create', 'invalid_input', {
        error: 'Invalid Opportunity creation.',
      })
    }
    const command = parsed.data

    const createCoreSelected = opportunityStageWritesUseCoreApi(profile.tenantId)
    if (!createCoreSelected) {
      return finishAction(traceId, profile, 'create', 'core_not_selected', {
        error: 'Opportunity creation is not enabled for this tenant.',
      })
    }

    const creation = await createOpportunityThroughCoreApi(
      command,
      projectOpportunityCreationIdempotencyKey(command)
    )
    if (!creation.ok) {
      return finishAction(traceId, profile, 'create', 'core_rejected', {
        error: creation.error ?? 'Opportunity creation was not completed.',
      })
    }

    const result = opportunityCreationResultSchema.safeParse(creation.data)
    if (
      !result.success ||
      !creationResultMatchesCommand(result.data, command, profile)
    ) {
      return finishAction(traceId, profile, 'create', 'invalid_core_result', {
        error: 'ERP Core API returned an invalid Opportunity creation result.',
      })
    }

    const refreshed = tryRevalidateProjectOpportunityPaths(command.projectId)
    return finishAction(
      traceId,
      profile,
      'create',
      refreshed ? 'success' : 'success_refresh_failed',
      {}
    )
  } catch {
    return finishAction(
      traceId,
      profile,
      'create',
      profile ? 'unavailable' : 'unauthorized',
      {
        error: profile
          ? 'ERP Core API is unavailable. No Opportunity was created.'
          : 'Unauthorized',
      }
    )
  }
}

export async function transitionStage(formData: FormData): Promise<ActionResult> {
  const traceId = randomUUID()
  let profile: UserProfile | undefined

  try {
    profile = await requireUserProfile()
    if (!can(profile.role, 'opportunity.advance_stage')) {
      return finishAction(traceId, profile, 'transition', 'forbidden', {
        error: 'Forbidden',
      })
    }

    const rawClosingDate = formStringOrUndefined(formData.get('closing_date'))
    const closingDate = rawClosingDate
      ? normalizeManilaDateTime(rawClosingDate)
      : undefined
    if (rawClosingDate && !closingDate) {
      return finishAction(traceId, profile, 'transition', 'invalid_input', {
        error: 'Invalid Opportunity stage transition.',
      })
    }

    const parsed = transitionSchema.safeParse({
      opportunity_id: formData.get('opportunity_id'),
      project_id: formData.get('project_id'),
      new_stage: formData.get('new_stage'),
      reason: formValueOrUndefined(formData.get('reason')),
      tcv_cents: formValueOrUndefined(formData.get('tcv_cents')),
      gp_cents: formValueOrUndefined(formData.get('gp_cents')),
      ...(closingDate ? { closing_date: closingDate } : {}),
    })
    if (!parsed.success) {
      return finishAction(traceId, profile, 'transition', 'invalid_input', {
        error: 'Invalid Opportunity stage transition.',
      })
    }
    const input = parsed.data

    const coreSelected = opportunityStageWritesUseCoreApi(profile.tenantId)
    if (!coreSelected) {
      return finishAction(traceId, profile, 'transition', 'core_not_selected', {
        error: 'Opportunity stage transition is not enabled for this tenant.',
      })
    }

    const command = opportunityStageTransitionCommandSchema.parse({
      newStage: input.new_stage,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.tcv_cents !== undefined ? { tcvCents: input.tcv_cents } : {}),
      ...(input.gp_cents !== undefined ? { gpCents: input.gp_cents } : {}),
      ...(input.closing_date ? { closingDate: input.closing_date } : {}),
    })
    const transition = await transitionOpportunityStageThroughCoreApi(
      input.opportunity_id,
      command,
      projectStageTransitionIdempotencyKey(input.opportunity_id, command)
    )
    if (!transition.ok) {
      return finishAction(traceId, profile, 'transition', 'core_rejected', {
        error:
          transition.error ?? 'Opportunity stage transition was not completed.',
      })
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
      return finishAction(traceId, profile, 'transition', 'invalid_core_result', {
        error: wonTransition
          ? 'ERP Core API returned an invalid Won-to-Project transition result.'
          : 'ERP Core API returned an invalid Opportunity stage transition result.',
      })
    }

    if (wonTransition) {
      if (!data.convertedToProject || !data.projectId || !data.checklistId) {
        return finishAction(
          traceId,
          profile,
          'transition',
          'invalid_core_result',
          {
            error:
              'ERP Core API returned an invalid Won-to-Project transition result.',
          }
        )
      }
      const refreshed = tryRevalidateProjectOpportunityPaths(
        input.project_id,
        data.projectId
      )
      return finishAction(
        traceId,
        profile,
        'transition',
        refreshed ? 'success' : 'success_refresh_failed',
        {
        projectId: data.projectId,
        }
      )
    }

    if (
      data.convertedToProject ||
      data.projectId !== null ||
      data.checklistId !== null
    ) {
      return finishAction(traceId, profile, 'transition', 'invalid_core_result', {
        error:
          'ERP Core API returned an invalid Opportunity stage transition result.',
      })
    }
    const refreshed = tryRevalidateProjectOpportunityPaths(input.project_id)
    return finishAction(
      traceId,
      profile,
      'transition',
      refreshed ? 'success' : 'success_refresh_failed',
      {}
    )
  } catch {
    return finishAction(
      traceId,
      profile,
      'transition',
      profile ? 'unavailable' : 'unauthorized',
      {
        error: profile
          ? 'ERP Core API is unavailable. No Opportunity stage transition was committed.'
          : 'Unauthorized',
      }
    )
  }
}

function creationResultMatchesCommand(
  result: OpportunityCreationResult,
  command: OpportunityCreationCommand,
  profile: UserProfile
): boolean {
  const expectedWeighted = (
    (BigInt(command.tcvCents) * 10n + 50n) /
    100n
  ).toString()
  return (
    result.tenantId === profile.tenantId &&
    result.projectId === command.projectId &&
    result.repId === profile.user.id &&
    result.stage === command.stage &&
    result.tcvCents === command.tcvCents &&
    result.gpCents === command.gpCents &&
    result.weightedTcvCents === expectedWeighted &&
    sameInstant(result.closingDate, command.closingDate ?? null) &&
    result.areaSqm === (command.areaSqm ?? null) &&
    result.opportunityType === (command.opportunityType ?? null) &&
    result.remarks === (command.remarks ?? null)
  )
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right
  return Date.parse(left) === Date.parse(right)
}

function projectOpportunityCreationIdempotencyKey(
  command: OpportunityCreationCommand
): string {
  return digestIdempotencyKey('project-opportunity-create', command)
}

function projectStageTransitionIdempotencyKey(
  opportunityId: string,
  command: OpportunityStageTransitionCommand
): string {
  return digestIdempotencyKey('project-opportunity-stage', {
    opportunityId,
    ...command,
  })
}

function digestIdempotencyKey(prefix: string, command: unknown): string {
  const commandDigest = createHash('sha256')
    .update(JSON.stringify(command), 'utf8')
    .digest('hex')
  return `${prefix}-${commandDigest}`
}

function tryRevalidateProjectOpportunityPaths(
  projectId: string,
  convertedProjectId?: string
): boolean {
  try {
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/pipeline')
    revalidatePath('/pipeline/coverage')
    revalidatePath('/pipeline/list')
    revalidatePath('/dashboard')
    if (convertedProjectId) revalidatePath(`/projects/${convertedProjectId}`)
    return true
  } catch {
    return false
  }
}

function normalizeManilaDateTime(value: string): string | null {
  const trimmed = value.trim()
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    if (!isCalendarDate(year, month, day)) return null
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+08:00`
  }

  const timestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    trimmed
  )
  if (!timestamp) return null
  const year = Number(timestamp[1])
  const month = Number(timestamp[2])
  const day = Number(timestamp[3])
  const hour = Number(timestamp[4])
  const minute = Number(timestamp[5])
  const second = Number(timestamp[6])
  if (
    !isCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }
  const instant = Date.parse(trimmed)
  if (!Number.isFinite(instant)) return null
  const manila = new Date(instant + 8 * 60 * 60 * 1000).toISOString()
  const dateTime = manila.endsWith('.000Z')
    ? manila.slice(0, -5)
    : manila.slice(0, -1)
  return `${dateTime}+08:00`
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function finishAction(
  traceId: string,
  profile: UserProfile | undefined,
  action: 'create' | 'transition',
  outcome: string,
  result: ActionResult
): ActionResult {
  console.info(
    JSON.stringify({
      event: 'project_opportunity_action',
      trace_id: traceId,
      tenant_id: profile?.tenantId ?? null,
      actor_id: profile?.user.id ?? null,
      action: `project_opportunity.${action}`,
      outcome,
    })
  )
  return result
}

function formStringOrUndefined(
  value: FormDataEntryValue | null
): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function formValueOrUndefined(
  value: FormDataEntryValue | null
): FormDataEntryValue | undefined {
  return typeof value === 'string' && value.trim().length === 0
    ? undefined
    : value ?? undefined
}
