import React from 'react'
import { formatCents } from '@third-code-erp/shared-types'
import type { ProjectBillingMilestoneListResult, ProjectBillingMilestoneRow } from '@third-code-erp/shared-types'
import type { BillingMilestonePagination } from './billing-milestone-navigation'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  certificate_pending: 'Certificate pending',
  certified: 'Certified',
  handed_over_finance: 'With Finance',
  invoiced: 'Invoiced',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const BLOCKER_LABEL: Record<ProjectBillingMilestoneRow['blockers'][number], string> = {
  war_evidence_below_milestone: 'Locked WAR evidence is below this milestone',
  coc_not_signed_for_final_milestone: 'COC must be signed for the 90%/100% gate',
  claim_not_certified: 'Claim still needs commercial certification',
  claim_not_handed_to_finance: 'Claim still needs Finance handover',
  invoice_not_linked: 'Invoice link is missing',
  invoice_not_issued: 'Linked invoice is still a draft',
}

function dateLabel(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '—'
}

function countLabel(total: number): string {
  return `${total} progress claim${total === 1 ? '' : 's'}`
}

function claimRange(result: ProjectBillingMilestoneListResult): string {
  if (result.rows.length === 0) return result.total === 0 ? countLabel(0) : `0 of ${countLabel(result.total)}`
  const first = (result.page - 1) * result.limit + 1
  const rawLast = first + result.rows.length - 1
  if (result.total === 0 || result.page > result.totalPages || first < 1 || first > result.total || rawLast > result.total) {
    return `Showing ${countLabel(result.rows.length)} on this page (${countLabel(result.total)} reported)`
  }
  const last = rawLast
  return `Showing ${first}–${last} of ${countLabel(result.total)}`
}

function PaginationChoice({ href, label }: { href: string | null; label: string }) {
  return href ? (
    <a className="project-billing-milestones__page-link" href={href}>{label}</a>
  ) : (
    <span className="project-billing-milestones__page-link project-billing-milestones__page-link--disabled" aria-disabled="true">
      {label}
    </span>
  )
}

function ProjectSourceNavigation({ projectId }: { projectId: string }) {
  return (
    <nav className="project-billing-milestones__sources" aria-label="Project billing sources">
      <a href={`/projects/${projectId}/progress`}>View project progress</a>
      <a href={`/projects/${projectId}/turnover`}>View turnover</a>
    </nav>
  )
}

function MilestonePagination({ result, pagination }: { result: ProjectBillingMilestoneListResult; pagination: BillingMilestonePagination }) {
  const showPagination = result.totalPages > 1 || result.page > 1
  if (!showPagination) return null

  return (
    <nav className="project-billing-milestones__pagination" aria-label="Milestone pages">
      <div className="project-billing-milestones__pagination-actions">
        <PaginationChoice href={result.page > 1 ? pagination.firstHref : null} label="First page" />
        <PaginationChoice href={pagination.previousHref} label="Previous" />
      </div>
      <span aria-current="page">Page {result.page} of {result.totalPages}</span>
      <PaginationChoice href={pagination.nextHref} label="Next" />
    </nav>
  )
}

export interface ProjectBillingMilestoneCardProps {
  result: ProjectBillingMilestoneListResult
  pagination: BillingMilestonePagination
}

export function ProjectBillingMilestoneCard({ result, pagination }: ProjectBillingMilestoneCardProps) {
  const isEmptyProject = result.total === 0 && result.rows.length === 0
  const isOutOfRangePage = result.rows.length === 0 && !isEmptyProject

  return (
    <section className="card project-billing-milestones" aria-labelledby="project-billing-milestones-heading">
      <div className="card-header project-billing-milestones__header">
        <div>
          <h2 id="project-billing-milestones-heading" className="card-title">Milestone billing traceability</h2>
          <p className="cost-section-sub">Source-linked path from locked WAR evidence through COC, claim certification, Finance handover, and invoice.</p>
        </div>
        <span className={`project-billing-milestones__coc project-billing-milestones__coc--${result.coc?.status ?? 'missing'}`}>
          COC: {result.coc?.status === 'signed' ? 'Signed' : result.coc ? result.coc.status.replace('_', ' ') : 'Not drafted'}
        </span>
      </div>

      <ProjectSourceNavigation projectId={result.projectId} />

      <div className="project-billing-milestones__summary" aria-live="polite">
        <p>{claimRange(result)}</p>
      </div>

      {isEmptyProject ? (
        <div className="card-empty project-billing-milestones__empty" role="status">
          No progress claims are linked to this project yet.
        </div>
      ) : isOutOfRangePage ? (
        <div className="card-empty project-billing-milestones__empty" role="status">
          <strong>Page {result.page} has no progress claims in the available range.</strong>
          <span>There are {countLabel(result.total)} across {result.totalPages} pages.</span>
          <a className="button-secondary" href={pagination.firstHref}>Return to first page</a>
        </div>
      ) : (
        <div className="project-billing-milestones__table-wrap">
          <table className="data-table">
            <caption className="sr-only">Milestone claims with locked WAR, COC, certification, Finance, and invoice evidence</caption>
            <thead>
              <tr>
                <th scope="col">Claim</th>
                <th scope="col">Milestone</th>
                <th scope="col">Status</th>
                <th scope="col">WAR evidence</th>
                <th scope="col">Invoice</th>
                <th scope="col">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.claimId}>
                  <td>
                    <a className="project-billing-milestones__source-link" href={`/claims/${row.claimId}`} aria-label={`View claim ${row.claimNumber}`}>
                      {row.claimNumber}
                    </a>
                    <small className="project-billing-milestones__amount">{formatCents(row.amountCents)}</small>
                  </td>
                  <td>{row.milestonePct}%</td>
                  <td>{STATUS_LABEL[row.claimStatus] ?? row.claimStatus}</td>
                  <td>{row.evidence.latestWarOverallPct === null ? 'No locked WAR' : `${row.evidence.latestWarOverallPct}% · ${dateLabel(row.evidence.latestWarWeekEnding)}`}</td>
                  <td>
                    {row.invoiceId ? (
                      <a className="project-billing-milestones__source-link" href={`/invoices/${row.invoiceId}`} aria-label={`View invoice ${row.invoiceNumber ?? 'record'}`}>
                        {row.invoiceNumber ?? 'View invoice'}
                      </a>
                    ) : 'Not linked'}
                    {row.invoiceId && row.invoiceStatus ? <small className="project-billing-milestones__invoice-status">{row.invoiceStatus}</small> : null}
                  </td>
                  <td>
                    {row.blockers.length > 0 ? (
                      <ul className="project-billing-milestones__blockers" aria-label={`Blockers for ${row.claimNumber}`}>
                        {row.blockers.map((blocker) => <li key={blocker}>{BLOCKER_LABEL[blocker]}</li>)}
                      </ul>
                    ) : row.readyForInvoice ? (
                      <span className="project-billing-milestones__ready">Ready for invoice</span>
                    ) : (
                      <span className="muted">In progress</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MilestonePagination result={result} pagination={pagination} />
    </section>
  )
}
