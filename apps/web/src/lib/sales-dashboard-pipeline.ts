import {
  PIPELINE_STAGES,
  STAGE_LEGACY_MAP,
  STAGE_TRANSITIONS,
  opportunityStageValues,
  type OpportunityStage,
  type PipelineStage,
} from '@third-code-erp/shared-types'

export const SALES_FUNNEL_STAGES = [
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
] as const satisfies readonly PipelineStage[]

export type SalesFunnelStage = (typeof SALES_FUNNEL_STAGES)[number]

const TERMINAL_STAGES: ReadonlySet<PipelineStage> = new Set(['won', 'lost'])

export interface StageAggregateInput {
  stage: OpportunityStage
  count: number
  tcvCents: number
  gpCents: number
}

export interface CanonicalStageAggregate {
  stage: PipelineStage
  count: number
  tcvCents: number
  gpCents: number
}

export interface SalesConversionRate {
  fromStage: SalesFunnelStage
  toStage: SalesFunnelStage
  fromCount: number
  toCount: number
  ratePct: number
}

export function canonicalSalesStage(stage: OpportunityStage): PipelineStage {
  return STAGE_LEGACY_MAP[stage]
}

export function isActiveSalesStage(stage: OpportunityStage): boolean {
  return !TERMINAL_STAGES.has(canonicalSalesStage(stage))
}

/**
 * The board renders legacy rows in their canonical ABI OPS column. Permit the
 * corresponding next canonical transition while preserving the original
 * legacy transition rules for every existing caller.
 */
export function isCompatibleOpportunityTransition(
  currentStage: OpportunityStage,
  nextStage: OpportunityStage
): boolean {
  if (STAGE_TRANSITIONS[currentStage].includes(nextStage)) return true

  const currentCanonical = canonicalSalesStage(currentStage)
  const nextCanonical = canonicalSalesStage(nextStage)
  return STAGE_TRANSITIONS[currentCanonical].includes(nextCanonical)
}

export const ACTIVE_SALES_OPPORTUNITY_STAGES = opportunityStageValues.filter(
  isActiveSalesStage
)

export const WON_OPPORTUNITY_STAGES = opportunityStageValues.filter(
  (stage) => canonicalSalesStage(stage) === 'won'
)

export const LOST_OPPORTUNITY_STAGES = opportunityStageValues.filter(
  (stage) => canonicalSalesStage(stage) === 'lost'
)

export const LEAD_OPPORTUNITY_STAGES = opportunityStageValues.filter(
  (stage) => canonicalSalesStage(stage) === 'lead'
)

export const CONVERSION_OPPORTUNITY_STAGES = opportunityStageValues.filter(
  (stage) => isActiveSalesStage(stage) && canonicalSalesStage(stage) !== 'lead'
)

/**
 * Keeps historical opportunity rows visible without rewriting them: the
 * dashboard aggregates legacy stage values into their ABI OPS equivalents.
 */
export function normalizeStageAggregates(
  rows: readonly StageAggregateInput[]
): CanonicalStageAggregate[] {
  const totals = new Map<PipelineStage, CanonicalStageAggregate>()

  for (const row of rows) {
    const stage = canonicalSalesStage(row.stage)
    const current = totals.get(stage) ?? {
      stage,
      count: 0,
      tcvCents: 0,
      gpCents: 0,
    }
    current.count += row.count
    current.tcvCents += row.tcvCents
    current.gpCents += row.gpCents
    totals.set(stage, current)
  }

  return PIPELINE_STAGES.flatMap((stage) => {
    const total = totals.get(stage)
    return total ? [total] : []
  })
}

/**
 * A closed-lost record is an outcome, not a later funnel step. It therefore
 * never contributes to the at-or-beyond counts used for stage conversion.
 */
export function conversionRatesFromStageCounts(
  rows: readonly Pick<StageAggregateInput, 'stage' | 'count'>[]
): SalesConversionRate[] {
  const atStage = new Map<SalesFunnelStage, number>(
    SALES_FUNNEL_STAGES.map((stage) => [stage, 0])
  )

  for (const row of rows) {
    const stage = canonicalSalesStage(row.stage)
    if (stage === 'lost') continue
    const current = atStage.get(stage as SalesFunnelStage) ?? 0
    atStage.set(stage as SalesFunnelStage, current + row.count)
  }

  const atOrBeyond = new Map<SalesFunnelStage, number>()
  for (let index = 0; index < SALES_FUNNEL_STAGES.length; index += 1) {
    const stage = SALES_FUNNEL_STAGES[index]!
    let count = 0
    for (let later = index; later < SALES_FUNNEL_STAGES.length; later += 1) {
      count += atStage.get(SALES_FUNNEL_STAGES[later]!) ?? 0
    }
    atOrBeyond.set(stage, count)
  }

  const rates: SalesConversionRate[] = []
  for (let index = 0; index < SALES_FUNNEL_STAGES.length - 1; index += 1) {
    const fromStage = SALES_FUNNEL_STAGES[index]!
    const toStage = SALES_FUNNEL_STAGES[index + 1]!
    const fromCount = atOrBeyond.get(fromStage) ?? 0
    const toCount = atOrBeyond.get(toStage) ?? 0
    rates.push({
      fromStage,
      toStage,
      fromCount,
      toCount,
      ratePct: fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : 0,
    })
  }
  return rates
}
