import React from 'react'
import Link from 'next/link'
import { formatCents, formatCentsCompact } from '@third-code-erp/shared-types'
import type {
  ManagementDashboardData,
  ManagementProjectMarginRow,
} from '@/lib/dashboard-queries'

function signedMoney(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

function marginPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

function varianceClass(value: number, positiveIsBad = true): string {
  const bad = positiveIsBad ? value > 0 : value < 0
  if (bad) return 'management-health__bad'
  if (value === 0) return ''
  return 'management-health__good'
}

function ProjectHealthRow({ row }: { row: ManagementProjectMarginRow }) {
  const hasMarginBaseline =
    row.hasApprovedBom && row.tcvCents > 0 && row.hasApprovedBudget

  return (
    <tr>
      <td>
        <Link
          className="management-health__project-link"
          href={`/projects/${row.projectId}/cost`}
        >
          <strong>{row.projectName}</strong>
        </Link>
        <span className="finance-cell-detail">
          {row.projectCode ?? 'No project code'} | {row.projectStatus.replace('_', ' ')}
        </span>
      </td>
      <td className="num finance-money">
        {row.hasApprovedBom ? formatCentsCompact(row.tcvCents) : 'No BOM'}
      </td>
      <td className="num">
        <strong>{hasMarginBaseline ? marginPct(row.forecastMarginBps) : 'No baseline'}</strong>
        <span className="finance-cell-detail">
          {hasMarginBaseline
            ? `baseline ${marginPct(row.baselineMarginBps)}`
            : 'approve a budget to calculate'}
        </span>
      </td>
      <td className={`num finance-money ${varianceClass(row.marginVarianceBps, false)}`}>
        {hasMarginBaseline
          ? `${row.marginVarianceBps > 0 ? '+' : ''}${marginPct(row.marginVarianceBps)}`
          : 'N/A'}
      </td>
      <td className={`num finance-money ${varianceClass(row.costVarianceCents)}`}>
        {row.hasApprovedBudget ? signedMoney(row.costVarianceCents) : 'N/A'}
        <span className="finance-cell-detail">
          forecast {formatCentsCompact(row.forecastCostCents)}
        </span>
      </td>
      <td className="num">
        <strong className={row.permitOverdueCount > 0 ? 'management-health__bad' : ''}>
          {row.permitExposureCount}
        </strong>
        <span className="finance-cell-detail">
          {row.permitOverdueCount > 0
            ? `${row.permitOverdueCount} overdue`
            : 'active exposure'}
        </span>
      </td>
      <td
        className={`num finance-money ${row.unsignedVoExposureCents > 0 ? 'management-health__warning' : ''}`}
      >
        {formatCentsCompact(row.unsignedVoExposureCents)}
        <span className="finance-cell-detail">unsigned scope</span>
      </td>
    </tr>
  )
}

export function ManagementHealth({ data }: { data: ManagementDashboardData }) {
  return (
    <section className="management-health" aria-labelledby="management-health-heading">
      <div className="management-health__header">
        <div>
          <p className="page-eyebrow">Execution health</p>
          <h2 id="management-health-heading">Project margin &amp; exposure</h2>
          <p>
            Forecast margin uses posted supplier-bill actuals and committed POs.
            Unsigned VOs, permits, and SLA breaches stay explicit risk signals.
          </p>
        </div>
        <div className="management-health__summary" aria-label="Execution risk summary">
          <span>
            <strong>{data.totals.permitExposureCount}</strong> permits exposed
          </span>
          <span>
            <strong>{data.totals.permitOverdueCount}</strong> overdue
          </span>
          <span>
            <strong>{data.totals.slaBreachCount}</strong> SLA breaches
          </span>
        </div>
      </div>

      <div className="finance-table-shell">
        {data.projectMargins.length === 0 ? (
          <div className="card-empty">No active or on-hold projects to review.</div>
        ) : (
          <table className="data-table management-health__table">
            <caption className="sr-only">
              Active project margin, cost variance, permit exposure, and unsigned variation-order exposure
            </caption>
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">TCV</th>
                <th className="num">Forecast margin</th>
                <th className="num">Margin Delta</th>
                <th className="num">Cost variance</th>
                <th className="num">Permit exposure</th>
                <th className="num">Unsigned VO</th>
              </tr>
            </thead>
            <tbody>
              {data.projectMargins.map((row) => (
                <ProjectHealthRow key={row.projectId} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="management-health__sla">
        <div>
          <h3>SLA breaches by business unit</h3>
          <p>Includes marked breaches, escalations, and overdue running clocks.</p>
        </div>
        {data.slaBreachesByBu.length === 0 ? (
          <span className="management-health__empty">No breached or overdue clocks.</span>
        ) : (
          <div className="management-health__bu-list">
            {data.slaBreachesByBu.map((row) => (
              <span key={row.businessUnit} className="management-health__bu-chip">
                <strong>{row.businessUnit}</strong>
                <em>{row.breachCount}</em>
              </span>
            ))}
          </div>
        )}
      </div>

      {data.totals.unsignedVoExposureCents !== 0 && (
        <p className="management-health__note" role="status">
          Unsigned VO exposure: {formatCents(data.totals.unsignedVoExposureCents)}. It is not
          included in posted cost actuals until the VO is signed and executed.
        </p>
      )}
    </section>
  )
}
