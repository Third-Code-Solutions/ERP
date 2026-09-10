import React from 'react'
import { formatCents } from '@third-code-erp/shared-types'
import type { ProjectBillingMilestoneListResult, ProjectBillingMilestoneRow } from '@third-code-erp/shared-types'

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
  return value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
}

export function ProjectBillingMilestoneCard({ result }: { result: ProjectBillingMilestoneListResult }) {
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
      {result.rows.length === 0 ? (
        <p className="card-empty">No progress claims are linked to this project yet.</p>
      ) : (
        <div className="project-billing-milestones__table-wrap">
          <table className="data-table">
            <thead><tr><th>Claim</th><th>Milestone</th><th>Status</th><th>WAR evidence</th><th>Invoice</th><th>Readiness</th></tr></thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.claimId}>
                  <td><strong>{row.claimNumber}</strong><small className="project-billing-milestones__amount">{formatCents(row.amountCents)}</small></td>
                  <td>{row.milestonePct}%</td>
                  <td>{STATUS_LABEL[row.claimStatus] ?? row.claimStatus}</td>
                  <td>{row.evidence.latestWarOverallPct === null ? 'No locked WAR' : `${row.evidence.latestWarOverallPct}% · ${dateLabel(row.evidence.latestWarWeekEnding)}`}</td>
                  <td>{row.invoiceNumber ? `${row.invoiceNumber} · ${row.invoiceStatus ?? 'unknown'}` : 'Not linked'}</td>
                  <td>
                    {row.readyForInvoice ? <span className="project-billing-milestones__ready">Ready for invoice</span> : row.blockers.length > 0 ? <ul className="project-billing-milestones__blockers">{row.blockers.slice(0, 2).map((blocker) => <li key={blocker}>{BLOCKER_LABEL[blocker]}</li>)}</ul> : <span className="muted">In progress</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
