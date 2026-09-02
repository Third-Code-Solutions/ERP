import { sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { computeCostControlMetrics } from '@third-code-erp/shared-types/cost'

type RawCostControlRow = {
  cost_code_id: string | null
  code: string | null
  name: string | null
  category: string | null
  bom_line_item_id: string | null
  bom_line_code: string | null
  bom_line_description: string | null
  baseline_cents: number | string | null
  committed_cents: number | string | null
  actual_cents: number | string | null
  unreconciled_cents: number | string | null
}

type RawProjectCostControlTotalsRow = {
  project_id: string
  baseline_cents: number | string | null
  committed_cents: number | string | null
  actual_cents: number | string | null
  unreconciled_cents: number | string | null
}

export interface ProjectCostControlRow {
  key: string
  costCodeId: string | null
  code: string
  name: string
  category: string
  bomLineItemId: string | null
  bomLineCode: string | null
  bomLineDescription: string | null
  baselineCents: number
  committedCents: number
  actualCents: number
  unreconciledCents: number
  forecastCents: number
  remainingCents: number
  /** Positive means posted supplier-bill actuals exceed the baseline. */
  varianceCents: number
}

export interface ProjectCostControlTotals {
  baselineCents: number
  committedCents: number
  actualCents: number
  unreconciledCents: number
  forecastCents: number
  remainingCents: number
  varianceCents: number
}

export interface ProjectCostControl {
  rows: ProjectCostControlRow[]
  totals: ProjectCostControlTotals
}

interface ProjectCostControlAccess {
  includeBomDetails?: boolean
  includePurchaseOrders?: boolean
}

function cents(value: number | string | null): number {
  return Number(value ?? 0)
}

function emptyProjectCostControlTotals(): ProjectCostControlTotals {
  return {
    baselineCents: 0,
    committedCents: 0,
    actualCents: 0,
    unreconciledCents: 0,
    forecastCents: 0,
    remainingCents: 0,
    varianceCents: 0,
  }
}

async function getCostCodeGrainControlRows(params: {
  tenantId: string
  projectId: string
  includePurchaseOrders: boolean
}): Promise<RawCostControlRow[]> {
  const commitmentCte = params.includePurchaseOrders
    ? sql`
        commitment as (
          select
            po_line.cost_code_id,
            sum(po_line.line_total_cents)::bigint as committed_cents
          from public.po_line_items po_line
          join public.purchase_orders purchase_order
            on purchase_order.id = po_line.po_id
           and purchase_order.tenant_id = po_line.tenant_id
          where po_line.tenant_id = ${params.tenantId}::uuid
            and purchase_order.project_id = ${params.projectId}::uuid
            and purchase_order.status::text in (
              'confirmed',
              'partial_delivery',
              'delivered',
              'issued',
              'partial_delivered',
              'fully_delivered'
            )
          group by po_line.cost_code_id
        )
      `
    : sql`
        commitment as (
          select
            null::uuid as cost_code_id,
            0::bigint as committed_cents
          where false
        )
      `

  return db.execute<RawCostControlRow>(sql`
    with budget as (
      select
        budget_line.cost_code_id,
        sum(budget_line.amount_cents)::bigint as baseline_cents
      from public.project_budget_lines budget_line
      join public.project_budgets budget
        on budget.id = budget_line.project_budget_id
       and budget.tenant_id = budget_line.tenant_id
      where budget_line.tenant_id = ${params.tenantId}::uuid
        and budget.project_id = ${params.projectId}::uuid
        and budget.status = 'approved'
      group by budget_line.cost_code_id
    ),
    ${commitmentCte},
    actual as (
      select
        bill_line.cost_code_id,
        sum(bill_line.amount_cents)::bigint as actual_cents
      from public.supplier_bill_lines bill_line
      join public.supplier_bills bill
        on bill.id = bill_line.supplier_bill_id
       and bill.tenant_id = bill_line.tenant_id
      where bill_line.tenant_id = ${params.tenantId}::uuid
        and bill_line.project_id = ${params.projectId}::uuid
        and bill.project_id = ${params.projectId}::uuid
        and bill.status = 'posted'
      group by bill_line.cost_code_id
    ),
    unreconciled as (
      select
        entry.cost_code_id,
        sum(entry.amount_cents)::bigint as unreconciled_cents
      from public.cost_entries entry
      where entry.tenant_id = ${params.tenantId}::uuid
        and entry.project_id = ${params.projectId}::uuid
      group by entry.cost_code_id
    ),
    dimensions as (
      select cost_code_id from budget
      union
      select cost_code_id from commitment
      union
      select cost_code_id from actual
      union
      select cost_code_id from unreconciled
    )
    select
      dimension.cost_code_id,
      cost_code.code,
      cost_code.name,
      cost_code.category::text as category,
      null::uuid as bom_line_item_id,
      null::text as bom_line_code,
      null::text as bom_line_description,
      coalesce(budget.baseline_cents, 0)::bigint as baseline_cents,
      coalesce(commitment.committed_cents, 0)::bigint as committed_cents,
      coalesce(actual.actual_cents, 0)::bigint as actual_cents,
      coalesce(unreconciled.unreconciled_cents, 0)::bigint as unreconciled_cents
    from dimensions dimension
    left join budget
      on budget.cost_code_id is not distinct from dimension.cost_code_id
    left join commitment
      on commitment.cost_code_id is not distinct from dimension.cost_code_id
    left join actual
      on actual.cost_code_id is not distinct from dimension.cost_code_id
    left join unreconciled
      on unreconciled.cost_code_id is not distinct from dimension.cost_code_id
    left join public.cost_codes cost_code
      on cost_code.id = dimension.cost_code_id
     and cost_code.tenant_id = ${params.tenantId}::uuid
    order by cost_code.code nulls last
  `)
}

/**
 * Reads the same cost-control triangle as {@link getProjectCostControl}, but
 * batches the requested projects into one query. Dashboard views only need
 * totals, so returning the full line-level shape once per project creates an
 * avoidable N+1 query pattern during a route transition.
 */
export async function getProjectCostControlTotalsForProjects(params: {
  tenantId: string
  projectIds: readonly string[]
}): Promise<Map<string, ProjectCostControlTotals>> {
  const projectIds = [...new Set(params.projectIds)]
  const totalsByProject = new Map<string, ProjectCostControlTotals>(
    projectIds.map((projectId) => [
      projectId,
      emptyProjectCostControlTotals(),
    ])
  )

  if (projectIds.length === 0) return totalsByProject

  const projectIdList = sql.join(
    projectIds.map((projectId) => sql`${projectId}::uuid`),
    sql`, `
  )

  const rawRows = await db.execute<RawProjectCostControlTotalsRow>(sql`
    with budget as (
      select
        budget.project_id,
        budget_line.cost_code_id,
        budget_line.bom_line_item_id,
        sum(budget_line.amount_cents)::bigint as baseline_cents
      from public.project_budget_lines budget_line
      join public.project_budgets budget
        on budget.id = budget_line.project_budget_id
       and budget.tenant_id = budget_line.tenant_id
      where budget_line.tenant_id = ${params.tenantId}::uuid
        and budget.project_id in (${projectIdList})
        and budget.status = 'approved'
      group by budget.project_id, budget_line.cost_code_id, budget_line.bom_line_item_id
    ),
    commitment as (
      select
        purchase_order.project_id,
        po_line.cost_code_id,
        po_line.bom_line_item_id,
        sum(po_line.line_total_cents)::bigint as committed_cents
      from public.po_line_items po_line
      join public.purchase_orders purchase_order
        on purchase_order.id = po_line.po_id
       and purchase_order.tenant_id = po_line.tenant_id
      where po_line.tenant_id = ${params.tenantId}::uuid
        and purchase_order.project_id in (${projectIdList})
        and purchase_order.status::text in (
          'confirmed',
          'partial_delivery',
          'delivered',
          'issued',
          'partial_delivered',
          'fully_delivered'
        )
      group by purchase_order.project_id, po_line.cost_code_id, po_line.bom_line_item_id
    ),
    actual as (
      select
        bill_line.project_id,
        bill_line.cost_code_id,
        bill_line.bom_line_item_id,
        sum(bill_line.amount_cents)::bigint as actual_cents
      from public.supplier_bill_lines bill_line
      join public.supplier_bills bill
        on bill.id = bill_line.supplier_bill_id
       and bill.tenant_id = bill_line.tenant_id
      join public.po_line_items po_line
        on po_line.id = bill_line.po_line_item_id
       and po_line.tenant_id = bill_line.tenant_id
       and po_line.bom_line_item_id is not distinct from bill_line.bom_line_item_id
      where bill_line.tenant_id = ${params.tenantId}::uuid
        and bill_line.project_id in (${projectIdList})
        and bill.project_id = bill_line.project_id
        and bill.status = 'posted'
      group by bill_line.project_id, bill_line.cost_code_id, bill_line.bom_line_item_id
    ),
    unreconciled as (
      select
        entry.project_id,
        entry.cost_code_id,
        entry.bom_line_item_id,
        sum(entry.amount_cents)::bigint as unreconciled_cents
      from public.cost_entries entry
      where entry.tenant_id = ${params.tenantId}::uuid
        and entry.project_id in (${projectIdList})
      group by entry.project_id, entry.cost_code_id, entry.bom_line_item_id
    ),
    dimensions as (
      select
        project_id,
        cost_code_id,
        bom_line_item_id,
        baseline_cents,
        0::bigint as committed_cents,
        0::bigint as actual_cents,
        0::bigint as unreconciled_cents
      from budget
      union all
      select
        project_id,
        cost_code_id,
        bom_line_item_id,
        0::bigint,
        committed_cents,
        0::bigint,
        0::bigint
      from commitment
      union all
      select
        project_id,
        cost_code_id,
        bom_line_item_id,
        0::bigint,
        0::bigint,
        actual_cents,
        0::bigint
      from actual
      union all
      select
        project_id,
        cost_code_id,
        bom_line_item_id,
        0::bigint,
        0::bigint,
        0::bigint,
        unreconciled_cents
      from unreconciled
    )
    select
      project_id,
      sum(baseline_cents)::bigint as baseline_cents,
      sum(committed_cents)::bigint as committed_cents,
      sum(actual_cents)::bigint as actual_cents,
      sum(unreconciled_cents)::bigint as unreconciled_cents
    from dimensions
    group by project_id, cost_code_id, bom_line_item_id
  `)

  for (const raw of rawRows) {
    const totals = totalsByProject.get(raw.project_id)
    if (!totals) continue

    const baselineCents = cents(raw.baseline_cents)
    const committedCents = cents(raw.committed_cents)
    const actualCents = cents(raw.actual_cents)
    const metrics = computeCostControlMetrics({
      baselineCents,
      committedCents,
      actualCents,
    })

    totals.baselineCents += baselineCents
    totals.committedCents += committedCents
    totals.actualCents += actualCents
    totals.unreconciledCents += cents(raw.unreconciled_cents)
    totals.forecastCents += metrics.forecastCents
    totals.remainingCents += metrics.remainingCents
    totals.varianceCents += metrics.varianceCents
  }

  return totalsByProject
}

/**
 * Reads the WO-17 cost-control triangle at the finest grain authorized for
 * the caller. BOM joins and PO commitment reads are independent because
 * `budget.read` does not imply access to either domain.
 *
 * Budget lines, PO lines, and posted supplier-bill lines each contribute a
 * `(cost_code_id, bom_line_item_id)` dimension. Supplier-bill actuals use the
 * denormalized BOM-line evidence maintained by the database trigger. Manual or
 * legacy cost entries are returned separately so they cannot silently change
 * the posted-invoice margin calculation.
 */
export async function getProjectCostControl(params: {
  tenantId: string
  projectId: string
} & ProjectCostControlAccess): Promise<ProjectCostControl> {
  const includeBomDetails = params.includeBomDetails ?? true
  const includePurchaseOrders = params.includePurchaseOrders ?? true

  const rawRows = includeBomDetails && includePurchaseOrders
    ? await db.execute<RawCostControlRow>(sql`
    with budget as (
      select
        budget_line.cost_code_id,
        budget_line.bom_line_item_id,
        sum(budget_line.amount_cents)::bigint as baseline_cents
      from public.project_budget_lines budget_line
      join public.project_budgets budget
        on budget.id = budget_line.project_budget_id
       and budget.tenant_id = budget_line.tenant_id
      where budget_line.tenant_id = ${params.tenantId}::uuid
        and budget.project_id = ${params.projectId}::uuid
        and budget.status = 'approved'
      group by budget_line.cost_code_id, budget_line.bom_line_item_id
    ),
    commitment as (
      select
        po_line.cost_code_id,
        po_line.bom_line_item_id,
        sum(po_line.line_total_cents)::bigint as committed_cents
      from public.po_line_items po_line
      join public.purchase_orders purchase_order
        on purchase_order.id = po_line.po_id
       and purchase_order.tenant_id = po_line.tenant_id
      where po_line.tenant_id = ${params.tenantId}::uuid
        and purchase_order.project_id = ${params.projectId}::uuid
        and purchase_order.status::text in (
          'confirmed',
          'partial_delivery',
          'delivered',
          'issued',
          'partial_delivered',
          'fully_delivered'
        )
      group by po_line.cost_code_id, po_line.bom_line_item_id
    ),
    actual as (
      select
        bill_line.cost_code_id,
        bill_line.bom_line_item_id,
        sum(bill_line.amount_cents)::bigint as actual_cents
      from public.supplier_bill_lines bill_line
      join public.supplier_bills bill
        on bill.id = bill_line.supplier_bill_id
       and bill.tenant_id = bill_line.tenant_id
      join public.po_line_items po_line
        on po_line.id = bill_line.po_line_item_id
       and po_line.tenant_id = bill_line.tenant_id
       and po_line.bom_line_item_id is not distinct from bill_line.bom_line_item_id
      where bill_line.tenant_id = ${params.tenantId}::uuid
        and bill_line.project_id = ${params.projectId}::uuid
        and bill.project_id = ${params.projectId}::uuid
        and bill.status = 'posted'
      group by bill_line.cost_code_id, bill_line.bom_line_item_id
    ),
    unreconciled as (
      select
        entry.cost_code_id,
        entry.bom_line_item_id,
        sum(entry.amount_cents)::bigint as unreconciled_cents
      from public.cost_entries entry
      where entry.tenant_id = ${params.tenantId}::uuid
        and entry.project_id = ${params.projectId}::uuid
      group by entry.cost_code_id, entry.bom_line_item_id
    ),
    dimensions as (
      select cost_code_id, bom_line_item_id from budget
      union
      select cost_code_id, bom_line_item_id from commitment
      union
      select cost_code_id, bom_line_item_id from actual
      union
      select cost_code_id, bom_line_item_id from unreconciled
    )
    select
      dimension.cost_code_id,
      cost_code.code,
      cost_code.name,
      cost_code.category::text as category,
      dimension.bom_line_item_id,
      bom_line.code as bom_line_code,
      bom_line.description as bom_line_description,
      coalesce(budget.baseline_cents, 0)::bigint as baseline_cents,
      coalesce(commitment.committed_cents, 0)::bigint as committed_cents,
      coalesce(actual.actual_cents, 0)::bigint as actual_cents,
      coalesce(unreconciled.unreconciled_cents, 0)::bigint as unreconciled_cents
    from dimensions dimension
    left join budget
      on budget.cost_code_id is not distinct from dimension.cost_code_id
     and budget.bom_line_item_id is not distinct from dimension.bom_line_item_id
    left join commitment
      on commitment.cost_code_id is not distinct from dimension.cost_code_id
     and commitment.bom_line_item_id is not distinct from dimension.bom_line_item_id
    left join actual
      on actual.cost_code_id is not distinct from dimension.cost_code_id
     and actual.bom_line_item_id is not distinct from dimension.bom_line_item_id
    left join unreconciled
      on unreconciled.cost_code_id is not distinct from dimension.cost_code_id
     and unreconciled.bom_line_item_id is not distinct from dimension.bom_line_item_id
    left join public.cost_codes cost_code
      on cost_code.id = dimension.cost_code_id
     and cost_code.tenant_id = ${params.tenantId}::uuid
    left join public.bom_line_items bom_line
      on bom_line.id = dimension.bom_line_item_id
     and bom_line.tenant_id = ${params.tenantId}::uuid
    order by cost_code.code nulls last, bom_line.code nulls last, bom_line.description nulls last
      `)
    : await getCostCodeGrainControlRows({
        tenantId: params.tenantId,
        projectId: params.projectId,
        includePurchaseOrders,
      })

  const rows = rawRows.map((raw) => {
    const baselineCents = cents(raw.baseline_cents)
    const committedCents = cents(raw.committed_cents)
    const actualCents = cents(raw.actual_cents)
    const unreconciledCents = cents(raw.unreconciled_cents)
    const metrics = computeCostControlMetrics({
      baselineCents,
      committedCents,
      actualCents,
    })
    return {
      key: `${raw.cost_code_id ?? 'unassigned'}:${raw.bom_line_item_id ?? 'unassigned'}`,
      costCodeId: raw.cost_code_id,
      code: raw.code ?? 'UNASSIGNED',
      name: raw.name ?? 'No Cost Code allocation',
      category: raw.category ?? 'unassigned',
      bomLineItemId: raw.bom_line_item_id,
      bomLineCode: raw.bom_line_code,
      bomLineDescription: raw.bom_line_description,
      baselineCents,
      committedCents,
      actualCents,
      unreconciledCents,
      ...metrics,
    }
  })

  const totals = rows.reduce<ProjectCostControlTotals>(
    (sum, row) => ({
      baselineCents: sum.baselineCents + row.baselineCents,
      committedCents: sum.committedCents + row.committedCents,
      actualCents: sum.actualCents + row.actualCents,
      unreconciledCents: sum.unreconciledCents + row.unreconciledCents,
      forecastCents: sum.forecastCents + row.forecastCents,
      remainingCents: sum.remainingCents + row.remainingCents,
      varianceCents: sum.varianceCents + row.varianceCents,
    }),
    {
      baselineCents: 0,
      committedCents: 0,
      actualCents: 0,
      unreconciledCents: 0,
      forecastCents: 0,
      remainingCents: 0,
      varianceCents: 0,
    }
  )

  return { rows, totals }
}
