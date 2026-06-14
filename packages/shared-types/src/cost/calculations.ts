// Phase 3 / F3.2 — Cost-tracking math. Pure functions, integer centavos and
// basis points throughout (no floats stored), consistent with bom/calculations.
// The execution triangle: BOM budget → POs committed → cost_entries actual.

export type CostCategory =
  | 'material'
  | 'labour'
  | 'subcontractor'
  | 'equipment'
  | 'overhead'
  | 'other'

export const COST_CATEGORIES: readonly CostCategory[] = [
  'material',
  'labour',
  'subcontractor',
  'equipment',
  'overhead',
  'other',
] as const

// GP-erosion severity thresholds, in basis points of contract TCV.
export const GP_EROSION_WARN_BPS = 500 // 5% of TCV eroded → warning
export const GP_EROSION_DANGER_BPS = 1500 // 15% → danger

export type ErosionSeverity = 'none' | 'warning' | 'danger'

export interface ProjectCostInput {
  /** approved/locked BOM total cost (budget) */
  budgetCents: number
  /** sum of committed (non-draft, non-cancelled) PO totals */
  committedCents: number
  /** sum of recorded actual cost entries */
  actualCents: number
  /** contract value from the BOM (held constant for projection) */
  bomTcvCents: number
  /** original gross profit from the BOM */
  bomGpCents: number
}

export interface ProjectCostSnapshot {
  budgetCents: number
  committedCents: number
  actualCents: number
  /** best current estimate of total cost = max(actual, committed) */
  forecastCostCents: number
  /** budget − actual (positive = under budget) */
  budgetVarianceCents: number
  /** budget − committed */
  committedVarianceCents: number
  /** TCV − forecastCost (can go negative on overrun) */
  projectedGpCents: number
  /** originalGp − projectedGp (positive = GP eroding) */
  gpErosionCents: number
  /** GP erosion as basis points of TCV (positive = eroding) */
  gpErosionBps: number
  /** original GP margin from the BOM, in bps */
  originalGpMarginBps: number
  /** projected GP margin given current cost, in bps */
  projectedGpMarginBps: number
  severity: ErosionSeverity
}

function bpsOf(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part * 10000) / whole)
}

export function erosionSeverity(gpErosionBps: number): ErosionSeverity {
  if (gpErosionBps > GP_EROSION_DANGER_BPS) return 'danger'
  if (gpErosionBps > GP_EROSION_WARN_BPS) return 'warning'
  return 'none'
}

/** Roll a project's budget/committed/actual into a cost + GP-erosion snapshot. */
export function computeProjectCostSnapshot(input: ProjectCostInput): ProjectCostSnapshot {
  const { budgetCents, committedCents, actualCents, bomTcvCents, bomGpCents } = input

  // Invariant: NEVER sum actual + committed (that double-counts when PO→cost
  // ingestion lands). Estimate-at-completion is the higher of the two.
  const forecastCostCents = Math.max(actualCents, committedCents)
  const budgetVarianceCents = budgetCents - actualCents
  const committedVarianceCents = budgetCents - committedCents
  const projectedGpCents = bomTcvCents - forecastCostCents
  const gpErosionCents = bomGpCents - projectedGpCents
  const gpErosionBps = bpsOf(gpErosionCents, bomTcvCents)

  return {
    budgetCents,
    committedCents,
    actualCents,
    forecastCostCents,
    budgetVarianceCents,
    committedVarianceCents,
    projectedGpCents,
    gpErosionCents,
    gpErosionBps,
    originalGpMarginBps: bpsOf(bomGpCents, bomTcvCents),
    projectedGpMarginBps: bpsOf(projectedGpCents, bomTcvCents),
    severity: erosionSeverity(gpErosionBps),
  }
}

/** Sum actual cost by category. Always returns an entry for every category. */
export function computeCategoryRollup(
  entries: ReadonlyArray<{ cost_category: CostCategory; amount_cents: number }>
): Record<CostCategory, number> {
  const out: Record<CostCategory, number> = {
    material: 0,
    labour: 0,
    subcontractor: 0,
    equipment: 0,
    overhead: 0,
    other: 0,
  }
  for (const e of entries) {
    out[e.cost_category] = (out[e.cost_category] ?? 0) + e.amount_cents
  }
  return out
}
