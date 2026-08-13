import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  costCodes,
  costEntries,
  projectBudgets,
  projects,
} from '@third-code-erp/database/schema'
import {
  computeProjectCostSnapshot,
  computeCategoryRollup,
  COST_CATEGORIES,
  type CostCategory,
} from '@third-code-erp/shared-types/cost'
import { GpErosionBadge } from '@/components/cost/gp-erosion-badge'
import { CostEntryForm } from '@/components/cost/cost-entry-form'
import { CostControlTable } from '@/components/cost/cost-control-table'
import { CostTable, type CostRow } from '@/components/cost/cost-table'
import { getProjectCostControl } from '@/lib/operations/project-cost-control'

export const metadata: Metadata = { title: 'Cost Tracking' }

const CATEGORY_LABEL: Record<CostCategory, string> = {
  material: 'Material',
  labour: 'Labour',
  subcontractor: 'Subcontractor',
  equipment: 'Equipment',
  overhead: 'Overhead',
  other: 'Other',
}

function php(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function ProjectCostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getUserProfile()
  if (!profile) return null

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
  if (!project) return notFound()

  const [latestBom] = await db
    .select({
      total_cost_cents: boms.total_cost_cents,
      tcv_cents: boms.tcv_cents,
      gp_cents: boms.gp_cents,
      gp_margin_bps: boms.gp_margin_bps,
    })
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, profile.tenantId), inArray(boms.status, ['approved', 'locked'])))
    .orderBy(desc(boms.version))
    .limit(1)

  const [approvedBudget] = await db
    .select({
      total_budget_cents: projectBudgets.total_budget_cents,
      revision: projectBudgets.revision,
      original_gp_margin_bps: projectBudgets.original_gp_margin_bps,
    })
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.project_id, id),
        eq(projectBudgets.tenant_id, profile.tenantId),
        eq(projectBudgets.status, 'approved')
      )
    )
    .limit(1)

  const entries = await db
    .select({
      id: costEntries.id,
      description: costEntries.description,
      cost_category: costEntries.cost_category,
      cost_source: costEntries.cost_source,
      reference_number: costEntries.reference_number,
      amount_cents: costEntries.amount_cents,
      incurred_at: costEntries.incurred_at,
    })
    .from(costEntries)
    .where(and(eq(costEntries.project_id, id), eq(costEntries.tenant_id, profile.tenantId)))
    .orderBy(desc(costEntries.incurred_at))

  const activeCostCodes = await db
    .select({
      id: costCodes.id,
      code: costCodes.code,
      name: costCodes.name,
      category: costCodes.category,
    })
    .from(costCodes)
    .where(
      and(
        eq(costCodes.tenant_id, profile.tenantId),
        eq(costCodes.is_active, true)
      )
    )
    .orderBy(costCodes.code)

  const costControl = await getProjectCostControl({
    tenantId: profile.tenantId,
    projectId: id,
  })
  const actualCents = costControl.totals.actualCents
  const snapshot = computeProjectCostSnapshot({
    budgetCents:
      approvedBudget?.total_budget_cents ?? latestBom?.total_cost_cents ?? 0,
    committedCents: costControl.totals.committedCents,
    actualCents,
    bomTcvCents: latestBom?.tcv_cents ?? 0,
    bomGpCents: latestBom?.gp_cents ?? 0,
    originalGpMarginBps: approvedBudget?.original_gp_margin_bps,
  })

  const byCategory = computeCategoryRollup(
    costControl.rows
      .filter((row) => COST_CATEGORIES.includes(row.category as CostCategory))
      .map((row) => ({
        cost_category: row.category as CostCategory,
        amount_cents: row.actualCents,
      }))
  )
  const canRecord = can(profile.role, 'cost.record')

  const rows: CostRow[] = entries.map((e) => ({
    id: e.id,
    description: e.description,
    cost_category: e.cost_category,
    cost_source: e.cost_source,
    reference_number: e.reference_number,
    amount_cents: e.amount_cents,
    incurred_at: e.incurred_at.toISOString(),
  }))

  const remainingPositive = costControl.totals.remainingCents >= 0

  const kpis = [
    {
      label: approvedBudget ? 'Approved Budget' : 'BOM Estimate',
      value: php(snapshot.budgetCents),
      tone: 'plain' as const,
      note: approvedBudget
        ? `Controlled revision ${approvedBudget.revision}`
        : 'No approved Project Budget',
    },
    { label: 'PO Committed', value: php(snapshot.committedCents), tone: 'plain' as const },
    {
      label: 'Posted Actual',
      value: php(snapshot.actualCents),
      tone: 'plain' as const,
      note: 'Posted supplier-bill lines',
    },
    {
      label: 'Forecast Remaining',
      value: php(costControl.totals.remainingCents),
      tone: remainingPositive ? ('good' as const) : ('bad' as const),
      note: 'Budget less higher of PO or actual',
    },
  ]

  return (
    <div className="cost-page">
      <div className="cost-erosion-head">
        <div>
          <h2 className="cost-section-title">Cost vs Budget</h2>
          <p className="cost-section-sub">
            Actual spend against the approved BOM, with live GP-erosion signal.
          </p>
        </div>
        <GpErosionBadge bps={snapshot.gpErosionBps} />
      </div>

      <div className="finance-header-actions">
        <Link
          className="finance-primary-link"
          href={`/projects/${id}/cost/budget`}
        >
          Budget Control
        </Link>
      </div>

      <div className="cost-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cost-kpi">
            <span className="cost-kpi__label">{k.label}</span>
            <span
              className="cost-kpi__value mono"
              style={{
                color:
                  k.tone === 'good'
                    ? 'var(--color-success)'
                    : k.tone === 'bad'
                      ? 'var(--color-danger)'
                      : 'var(--color-neutral-900)',
              }}
            >
              {k.value}
            </span>
            {k.note && <span className="cost-kpi__note">{k.note}</span>}
          </div>
        ))}
        <div className="cost-kpi">
          <span className="cost-kpi__label">Projected GP</span>
          <span className="cost-kpi__value mono">{php(snapshot.projectedGpCents)}</span>
          <span className="cost-kpi__note">
            {(snapshot.projectedGpMarginBps / 100).toFixed(1)}% margin · was{' '}
            {(snapshot.originalGpMarginBps / 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="cost-grid">
        <div className="card cost-control-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Live cost control</h3>
              <p className="cost-control-caption">
                Budget → PO committed → posted actual. Each row stays tied to a
                Cost Code and BOM line; invoiced POs are not double-counted.
              </p>
            </div>
          </div>
          <CostControlTable rows={costControl.rows} />
          {costControl.totals.unreconciledCents > 0 && (
            <p className="cost-control-warning" role="status">
              {php(costControl.totals.unreconciledCents)} in manual or legacy
              cost entries is shown in the log but excluded from posted-invoice
              actuals. Reconcile those entries before commercial sign-off.
            </p>
          )}
        </div>
      </div>

      <div className="cost-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Cost log</h3>
            {canRecord && (
              <CostEntryForm projectId={id} costCodes={activeCostCodes} />
            )}
          </div>
          <CostTable entries={rows} projectId={id} canRecord={canRecord} />
        </div>

        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <h3 className="card-title">By category</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Actual</th>
                <th className="num">% of total</th>
              </tr>
            </thead>
            <tbody>
              {COST_CATEGORIES.map((cat) => {
                const amt = byCategory[cat]
                const pct = actualCents > 0 ? Math.round((amt / actualCents) * 100) : 0
                return (
                  <tr key={cat}>
                    <td>{CATEGORY_LABEL[cat]}</td>
                    <td className="num mono">{php(amt)}</td>
                    <td className="num mono">{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
