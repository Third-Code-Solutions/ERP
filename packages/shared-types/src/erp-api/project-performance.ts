import { z } from 'zod'

export const projectPerformanceStatusSchema = z.enum([
  'ready',
  'partial',
  'unavailable',
])

export const projectPerformanceProgressSourceSchema = z.enum([
  'weekly_progress',
  'normalized_schedule',
  'unavailable',
])

export const projectPerformancePlannedValueSourceSchema = z.enum([
  'normalized_schedule_labor',
  'unavailable',
])

export const projectPerformanceActualCostSourceSchema = z.enum([
  'posted_supplier_bills',
  'none',
])

export const projectPerformanceMissingEvidenceSchema = z.enum([
  'approved_budget',
  'planned_schedule',
  'actual_progress',
  'posted_supplier_bill_actuals',
])

export const projectPerformanceQuerySchema = z.object({}).strict()

export const projectPerformanceResultSchema = z
  .object({
    projectId: z.string().uuid(),
    asOf: z.string().datetime({ offset: true }),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: projectPerformanceStatusSchema,
    baselineCents: z.number().int().nonnegative().nullable(),
    plannedValueCents: z.number().int().nonnegative().nullable(),
    earnedValueCents: z.number().int().nonnegative().nullable(),
    actualCostCents: z.number().int().nonnegative(),
    estimateAtCompletionCents: z.number().int().nonnegative().nullable(),
    estimateToCompleteCents: z.number().int().nullable(),
    varianceAtCompletionCents: z.number().int().nullable(),
    costVarianceCents: z.number().int().nullable(),
    scheduleVarianceCents: z.number().int().nullable(),
    costPerformanceIndexBps: z.number().int().nonnegative().nullable(),
    schedulePerformanceIndexBps: z.number().int().nonnegative().nullable(),
    plannedPercentComplete: z.number().min(0).max(100).nullable(),
    actualPercentComplete: z.number().min(0).max(100).nullable(),
    latestProgressWeekEnding: z.string().datetime({ offset: true }).nullable(),
    progressSource: projectPerformanceProgressSourceSchema,
    plannedValueSource: projectPerformancePlannedValueSourceSchema,
    actualCostSource: projectPerformanceActualCostSourceSchema,
    actualCostEvidenceCount: z.number().int().nonnegative(),
    missingEvidence: z.array(projectPerformanceMissingEvidenceSchema),
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export type ProjectPerformanceStatus = z.infer<
  typeof projectPerformanceStatusSchema
>
export type ProjectPerformanceProgressSource = z.infer<
  typeof projectPerformanceProgressSourceSchema
>
export type ProjectPerformancePlannedValueSource = z.infer<
  typeof projectPerformancePlannedValueSourceSchema
>
export type ProjectPerformanceActualCostSource = z.infer<
  typeof projectPerformanceActualCostSourceSchema
>
export type ProjectPerformanceMissingEvidence = z.infer<
  typeof projectPerformanceMissingEvidenceSchema
>
export type ProjectPerformanceQuery = z.infer<typeof projectPerformanceQuerySchema>
export type ProjectPerformanceResult = z.infer<
  typeof projectPerformanceResultSchema
>

export interface ProjectPerformanceMathInput {
  projectId: string
  asOf: string
  currency: string
  baselineCents: number | null
  plannedPercentComplete: number | null
  actualPercentComplete: number | null
  latestProgressWeekEnding: string | null
  progressSource: ProjectPerformanceProgressSource
  plannedValueSource: ProjectPerformancePlannedValueSource
  actualCostCents: number
  actualCostEvidenceCount: number
}

function ratioBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.max(0, Math.round((numerator * 10_000) / denominator))
}

function valueAtPercent(baselineCents: number, percent: number): number {
  return Math.round((baselineCents * percent) / 100)
}

/**
 * Computes an auditable EVM/CVR snapshot from source-derived budget, schedule,
 * progress, and posted supplier-bill evidence. Missing inputs stay explicit;
 * the function never substitutes a BOM estimate for an approved baseline.
 */
export function computeProjectPerformance(
  input: ProjectPerformanceMathInput,
): ProjectPerformanceResult {
  const missingEvidence: ProjectPerformanceMissingEvidence[] = []
  const notes: string[] = []
  const baseline = input.baselineCents

  if (baseline === null) missingEvidence.push('approved_budget')
  if (input.plannedPercentComplete === null) {
    missingEvidence.push('planned_schedule')
  }
  if (input.actualPercentComplete === null) {
    missingEvidence.push('actual_progress')
  }
  if (input.actualCostEvidenceCount === 0) {
    missingEvidence.push('posted_supplier_bill_actuals')
  }

  const plannedValueCents =
    baseline === null || input.plannedPercentComplete === null
      ? null
      : valueAtPercent(baseline, input.plannedPercentComplete)
  const earnedValueCents =
    baseline === null || input.actualPercentComplete === null
      ? null
      : valueAtPercent(baseline, input.actualPercentComplete)
  const costVarianceCents =
    earnedValueCents === null ? null : earnedValueCents - input.actualCostCents
  const scheduleVarianceCents =
    earnedValueCents === null || plannedValueCents === null
      ? null
      : earnedValueCents - plannedValueCents
  const costPerformanceIndexBps =
    earnedValueCents === null
      ? null
      : ratioBps(earnedValueCents, input.actualCostCents)
  const schedulePerformanceIndexBps =
    earnedValueCents === null || plannedValueCents === null
      ? null
      : ratioBps(earnedValueCents, plannedValueCents)

  let estimateAtCompletionCents: number | null = null
  if (baseline !== null && earnedValueCents !== null) {
    const cpi = costPerformanceIndexBps
    if (cpi !== null && cpi > 0 && input.actualCostCents > 0) {
      estimateAtCompletionCents = Math.max(
        0,
        input.actualCostCents +
          // Keep the EAC calculation on the unrounded EV/AC ratio. CPI is
          // exposed as integer basis points, but using the rounded display
          // value here would introduce avoidable centavo drift.
          Math.round(
            ((baseline - earnedValueCents) * input.actualCostCents) /
              earnedValueCents,
          ),
      )
    } else {
      notes.push('Estimate at completion is unavailable until actual cost evidence yields a positive CPI.')
    }
  }
  const estimateToCompleteCents =
    estimateAtCompletionCents === null
      ? null
      : estimateAtCompletionCents - input.actualCostCents
  const varianceAtCompletionCents =
    baseline === null || estimateAtCompletionCents === null
      ? null
      : baseline - estimateAtCompletionCents

  if (input.progressSource === 'weekly_progress') {
    notes.push('Actual progress uses the latest submitted weekly progress update.')
  } else if (input.progressSource === 'normalized_schedule') {
    notes.push('Actual progress uses weighted normalized schedule task completion because no valid weekly progress update was available.')
  }
  if (input.plannedValueSource === 'normalized_schedule_labor') {
    notes.push('Planned value is time-phased from normalized schedule dates weighted by planned labour minutes.')
  }
  if (input.actualCostEvidenceCount === 0) {
    notes.push('No posted supplier-bill line evidence exists yet; actual cost is shown as zero and should not be treated as a completed cost close.')
  }

  const status: ProjectPerformanceStatus =
    baseline === null
      ? 'unavailable'
      : missingEvidence.length === 0
        ? 'ready'
        : 'partial'

  return projectPerformanceResultSchema.parse({
    projectId: input.projectId,
    asOf: input.asOf,
    currency: input.currency,
    status,
    baselineCents: baseline,
    plannedValueCents,
    earnedValueCents,
    actualCostCents: Math.max(0, input.actualCostCents),
    estimateAtCompletionCents,
    estimateToCompleteCents,
    varianceAtCompletionCents,
    costVarianceCents,
    scheduleVarianceCents,
    costPerformanceIndexBps,
    schedulePerformanceIndexBps,
    plannedPercentComplete: input.plannedPercentComplete,
    actualPercentComplete: input.actualPercentComplete,
    latestProgressWeekEnding: input.latestProgressWeekEnding,
    progressSource: input.progressSource,
    plannedValueSource: input.plannedValueSource,
    actualCostSource:
      input.actualCostEvidenceCount > 0 ? 'posted_supplier_bills' : 'none',
    actualCostEvidenceCount: Math.max(0, input.actualCostEvidenceCount),
    missingEvidence,
    notes,
  })
}
