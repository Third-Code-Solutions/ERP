import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  can,
  requireCapability,
  requireUserProfile,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  bomLineItems,
  boms,
  costCodes,
  projectBudgetLines,
  projectBudgets,
  projects,
} from '@third-code-erp/database/schema'
import {
  BudgetWorkspace,
  type BudgetDraft,
} from './budget-workspace'
import { CostControlTable } from '@/components/cost/cost-control-table'
import { getProjectCostControl } from '@/lib/operations/project-cost-control'

export const metadata: Metadata = {
  title: 'Project Budget Control',
  description:
    'Versioned construction budget baselines, commitments, actuals, and approval evidence.',
}

interface BudgetRegisterRow extends Record<string, unknown> {
  id: string
  revision: number
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded' | 'rejected'
  control_mode: 'monitor' | 'warn' | 'block'
  commitment_tolerance_bps: number
  currency: string
  effective_from: string
  revision_reason: string
  total_budget_cents: number
  original_gp_margin_bps: number
  source_bom_id: string | null
  submitted_by_name: string | null
  submitted_at: Date | null
  commercial_approved_by: string | null
  commercial_approved_name: string | null
  commercial_approved_at: Date | null
  finance_approved_by: string | null
  finance_approved_name: string | null
  finance_approved_at: Date | null
  rejected_by_name: string | null
  rejected_at: Date | null
  rejection_reason: string | null
  created_at: Date
}

function money(currency: string, cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function dateTime(value: Date | null): string {
  if (!value) return 'Pending'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function statusLabel(status: BudgetRegisterRow['status']): string {
  return status.replace('_', ' ')
}

export default async function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const profile = await requireUserProfile()
  requireCapability(profile, 'budget.read')

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!project) return notFound()

  const [codeRows, budgetRows, bomRows] = await Promise.all([
    db
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
      .orderBy(asc(costCodes.code)),
    db.execute<BudgetRegisterRow>(sql`
      select
        budget.id,
        budget.revision,
        budget.status,
        budget.control_mode,
        budget.commitment_tolerance_bps,
        budget.currency,
        budget.effective_from,
        budget.revision_reason,
        budget.total_budget_cents,
        budget.original_gp_margin_bps,
        budget.source_bom_id,
        submitter.full_name as submitted_by_name,
        budget.submitted_at,
        budget.commercial_approved_by,
        commercial.full_name as commercial_approved_name,
        budget.commercial_approved_at,
        budget.finance_approved_by,
        finance.full_name as finance_approved_name,
        budget.finance_approved_at,
        rejector.full_name as rejected_by_name,
        budget.rejected_at,
        budget.rejection_reason,
        budget.created_at
      from public.project_budgets budget
      left join public.users submitter
        on submitter.id = budget.submitted_by
       and submitter.tenant_id = budget.tenant_id
      left join public.users commercial
        on commercial.id = budget.commercial_approved_by
       and commercial.tenant_id = budget.tenant_id
      left join public.users finance
        on finance.id = budget.finance_approved_by
       and finance.tenant_id = budget.tenant_id
      left join public.users rejector
        on rejector.id = budget.rejected_by
       and rejector.tenant_id = budget.tenant_id
      where budget.tenant_id = ${profile.tenantId}::uuid
        and budget.project_id = ${projectId}::uuid
      order by budget.revision desc
    `),
    db
      .select({
        id: boms.id,
        version: boms.version,
        total: boms.total_cost_cents,
      })
      .from(boms)
      .where(
        and(
          eq(boms.tenant_id, profile.tenantId),
          eq(boms.project_id, projectId),
          inArray(boms.status, ['approved', 'locked'])
        )
      )
      .orderBy(desc(boms.version)),
  ])

  const sourceBomIds = bomRows.map((bom) => bom.id)
  const bomLineRows =
    sourceBomIds.length === 0
      ? []
      : await db
          .select({
            id: bomLineItems.id,
            bomId: bomLineItems.bom_id,
            code: bomLineItems.code,
            description: bomLineItems.description,
          })
          .from(bomLineItems)
          .where(
            and(
              eq(bomLineItems.tenant_id, profile.tenantId),
              inArray(bomLineItems.bom_id, sourceBomIds)
            )
          )
          .orderBy(asc(bomLineItems.sort_order))

  const draftRow = budgetRows.find((budget) => budget.status === 'draft') ?? null
  const pendingRow =
    budgetRows.find((budget) => budget.status === 'pending_approval') ?? null
  const approvedRow =
    budgetRows.find((budget) => budget.status === 'approved') ?? null

  let draft: BudgetDraft | null = null
  if (draftRow) {
    const lines = await db
      .select({
        id: projectBudgetLines.id,
        costCodeId: projectBudgetLines.cost_code_id,
        bomLineItemId: projectBudgetLines.bom_line_item_id,
        description: projectBudgetLines.description,
        amountCents: projectBudgetLines.amount_cents,
      })
      .from(projectBudgetLines)
      .where(
        and(
          eq(projectBudgetLines.tenant_id, profile.tenantId),
          eq(projectBudgetLines.project_budget_id, draftRow.id)
        )
      )
      .orderBy(asc(projectBudgetLines.line_number))
    draft = {
      id: draftRow.id,
      revision: draftRow.revision,
      sourceBomId: draftRow.source_bom_id,
      controlMode: draftRow.control_mode,
      toleranceBps: draftRow.commitment_tolerance_bps,
      currency: draftRow.currency,
      effectiveFrom: draftRow.effective_from,
      reason: draftRow.revision_reason,
      lines,
    }
  }

  const costControl = await getProjectCostControl({
    tenantId: profile.tenantId,
    projectId,
  })

  const currency = approvedRow?.currency ?? draftRow?.currency ?? 'PHP'
  const totals = costControl.totals

  return (
    <div className="budget-page">
      <header className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href={`/projects/${projectId}/cost`}>Project cost</Link>
            {' · '}Controlled baseline
          </p>
          <h1 className="page-title">Budget Control</h1>
          <p className="page-subtitle">
            {project.name} · one approved baseline, traceable changes, and
            per–Cost Code exposure.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/cost`}
          className="finance-secondary-link"
        >
          Return to cost
        </Link>
      </header>

      <section className="budget-control-strip">
        <div>
          <span>Current baseline</span>
          <strong>{money(currency, totals.baselineCents)}</strong>
          <small>
            {approvedRow
              ? `Approved revision ${approvedRow.revision}`
              : 'No approved revision'}
          </small>
        </div>
        <div>
          <span>Committed</span>
          <strong>{money(currency, totals.committedCents)}</strong>
          <small>Issued and confirmed Purchase Orders</small>
        </div>
        <div>
          <span>Actual</span>
          <strong>{money(currency, totals.actualCents)}</strong>
          <small>Posted supplier-bill lines</small>
        </div>
        <div>
          <span>Forecast</span>
          <strong>{money(currency, totals.forecastCents)}</strong>
          <small>Higher of PO commitment or posted actual</small>
        </div>
        <div
          className={
            totals.remainingCents >= 0
              ? 'budget-positive'
              : 'budget-negative'
          }
        >
          <span>Forecast variance</span>
          <strong>{money(currency, totals.remainingCents)}</strong>
          <small>
            {totals.remainingCents >= 0
              ? 'Available'
              : 'Exposure over baseline'}
          </small>
        </div>
      </section>

      {approvedRow && (
        <section className="budget-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">Live control view</p>
              <h2>Baseline to forecast</h2>
            </div>
            <p>
              Forecast uses the higher of commitment or posted actual at each
              Cost Code and BOM line. No project-level double count.
            </p>
          </div>
          <CostControlTable rows={costControl.rows} currency={currency} />
          {totals.unreconciledCents > 0 && (
            <p className="cost-control-warning" role="status">
              {money(currency, totals.unreconciledCents)} in manual or legacy
              cost entries is excluded from posted-invoice actuals until
              reconciled.
            </p>
          )}
        </section>
      )}

      <BudgetWorkspace
        projectId={projectId}
        canManage={can(profile.role, 'budget.manage')}
        canCommercialApprove={can(
          profile.role,
          'budget.approve_commercial'
        )}
        canFinanceApprove={can(profile.role, 'budget.approve_finance')}
        draft={draft}
        pendingBudget={
          pendingRow
            ? {
                id: pendingRow.id,
                revision: pendingRow.revision,
                commercialApprovedBy: pendingRow.commercial_approved_by,
                financeApprovedBy: pendingRow.finance_approved_by,
              }
            : null
        }
        approvedBudget={
          approvedRow
            ? { id: approvedRow.id, revision: approvedRow.revision }
            : null
        }
        codes={codeRows}
        sourceBoms={bomRows.map((bom) => ({
          id: bom.id,
          label: `BOM v${bom.version} · ${money('PHP', bom.total)}`,
        }))}
        bomLines={bomLineRows.map((line) => ({
          id: line.id,
          bomId: line.bomId,
          label: `${line.code ? `${line.code} · ` : ''}${line.description}`,
        }))}
      />

      <section className="budget-panel">
        <div className="budget-panel-heading">
          <div>
            <p className="finance-eyebrow">Decision evidence</p>
            <h2>Revision register</h2>
          </div>
          <p>Every baseline state and approval remains visible.</p>
        </div>
        <div className="budget-revision-list">
          {budgetRows.length === 0 ? (
            <div className="card-empty">
              <p>No Project Budget revision exists.</p>
              <span>Create Cost Codes, then establish the first baseline.</span>
            </div>
          ) : (
            budgetRows.map((budget) => (
              <article key={budget.id}>
                <div className="budget-revision-number">
                  <span>REV</span>
                  <strong>{String(budget.revision).padStart(2, '0')}</strong>
                </div>
                <div className="budget-revision-main">
                  <div>
                    <strong>{budget.revision_reason}</strong>
                    <span>
                      Effective {budget.effective_from} ·{' '}
                      {budget.control_mode} control ·{' '}
                      {(budget.commitment_tolerance_bps / 100).toFixed(2)}%
                      tolerance · original margin{' '}
                      {(budget.original_gp_margin_bps / 100).toFixed(2)}%
                    </span>
                  </div>
                  <span className={`finance-status finance-status-${budget.status}`}>
                    {statusLabel(budget.status)}
                  </span>
                </div>
                <div className="budget-revision-amount">
                  <strong>
                    {money(budget.currency, budget.total_budget_cents)}
                  </strong>
                  <span>{budget.currency}</span>
                </div>
                <div className="budget-revision-evidence">
                  <span>
                    Submitted
                    <strong>{budget.submitted_by_name ?? 'Not submitted'}</strong>
                    <small>{dateTime(budget.submitted_at)}</small>
                  </span>
                  <span>
                    Commercial
                    <strong>
                      {budget.commercial_approved_name ?? 'Awaiting approval'}
                    </strong>
                    <small>{dateTime(budget.commercial_approved_at)}</small>
                  </span>
                  <span>
                    Finance
                    <strong>
                      {budget.finance_approved_name ?? 'Awaiting approval'}
                    </strong>
                    <small>{dateTime(budget.finance_approved_at)}</small>
                  </span>
                  {budget.rejected_at && (
                    <span className="budget-rejected-evidence">
                      Rejected
                      <strong>{budget.rejected_by_name ?? 'Reviewer'}</strong>
                      <small>
                        {budget.rejection_reason} ·{' '}
                        {dateTime(budget.rejected_at)}
                      </small>
                    </span>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
