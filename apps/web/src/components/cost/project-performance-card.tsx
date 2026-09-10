import React from 'react'
import { formatCents } from '@third-code-erp/shared-types'
import type { ProjectPerformanceResult } from '@third-code-erp/shared-types'

function money(value: number | null): string {
  return value === null ? '—' : formatCents(value)
}

function index(value: number | null): string {
  return value === null ? '—' : `${(value / 10_000).toFixed(2)}×`
}

function statusLabel(status: ProjectPerformanceResult['status']): string {
  return status === 'ready'
    ? 'EVM ready'
    : status === 'partial'
      ? 'EVM partial'
      : 'EVM unavailable'
}

export function ProjectPerformanceCard({
  performance,
  error,
}: {
  performance: ProjectPerformanceResult | null
  error?: string
}) {
  if (!performance) {
    return (
      <section className="card project-performance" aria-labelledby="project-performance-heading">
        <div className="card-header">
          <div>
            <h3 id="project-performance-heading" className="card-title">Earned value / CVR</h3>
            <p className="cost-section-sub">Core could not load the source-of-truth performance snapshot.</p>
          </div>
        </div>
        <p className="card-empty" role="status">{error ?? 'Performance data is unavailable.'}</p>
      </section>
    )
  }

  return (
    <section className="card project-performance" aria-labelledby="project-performance-heading">
      <div className="card-header project-performance__header">
        <div>
          <h3 id="project-performance-heading" className="card-title">Earned value / CVR</h3>
          <p className="cost-section-sub">
            Budget, schedule, progress, and posted supplier-bill evidence kept separate so forecast margin is auditable.
          </p>
        </div>
        <span className={`project-performance__status project-performance__status--${performance.status}`}>
          {statusLabel(performance.status)}
        </span>
      </div>

      <div className="project-performance__metrics">
        <div><span>BAC</span><strong>{money(performance.baselineCents)}</strong><small>approved baseline</small></div>
        <div><span>PV</span><strong>{money(performance.plannedValueCents)}</strong><small>{performance.plannedPercentComplete === null ? 'no schedule evidence' : `${performance.plannedPercentComplete.toFixed(1)}% planned`}</small></div>
        <div><span>EV</span><strong>{money(performance.earnedValueCents)}</strong><small>{performance.actualPercentComplete === null ? 'no progress evidence' : `${performance.actualPercentComplete.toFixed(1)}% actual`}</small></div>
        <div><span>AC</span><strong>{money(performance.actualCostCents)}</strong><small>{performance.actualCostEvidenceCount} posted bill lines</small></div>
        <div><span>CPI</span><strong>{index(performance.costPerformanceIndexBps)}</strong><small>cost efficiency</small></div>
        <div><span>SPI</span><strong>{index(performance.schedulePerformanceIndexBps)}</strong><small>schedule efficiency</small></div>
        <div><span>EAC</span><strong>{money(performance.estimateAtCompletionCents)}</strong><small>estimate at completion</small></div>
        <div><span>VAC</span><strong>{money(performance.varianceAtCompletionCents)}</strong><small>budget minus EAC</small></div>
      </div>

      {performance.missingEvidence.length > 0 && (
        <p className="project-performance__note" role="note">
          Missing evidence: {performance.missingEvidence.join(', ').replaceAll('_', ' ')}. Metrics remain intentionally partial until those source records exist.
        </p>
      )}
      {performance.notes.length > 0 && (
        <ul className="project-performance__notes">
          {performance.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </section>
  )
}
