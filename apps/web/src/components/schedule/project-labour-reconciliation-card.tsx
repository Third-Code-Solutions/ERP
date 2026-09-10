import React from 'react'
import type {
  ProjectLabourReconciliationResult,
  ProjectLabourReconciliationStatus,
} from '@third-code-erp/shared-types'

const statusLabel: Record<ProjectLabourReconciliationStatus, string> = {
  ready: 'Ready',
  partial: 'Partial evidence',
  unavailable: 'No schedule evidence',
}

const statusColor: Record<ProjectLabourReconciliationStatus, string> = {
  ready: '#067647',
  partial: '#b54708',
  unavailable: '#667085',
}

function minutes(value: number): string {
  return `${value.toLocaleString('en-PH')} min`
}

function variance(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-PH')} min`
}

export function ProjectLabourReconciliationCard({
  result,
}: {
  result: ProjectLabourReconciliationResult
}) {
  return (
    <section className="card" aria-labelledby="project-labour-reconciliation-title">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="project-labour-reconciliation-title">
            Labour reconciliation
          </h2>
          <p className="card-subtitle">
            Planned versus captured task minutes from the normalized schedule.
          </p>
        </div>
        <span style={{ color: statusColor[result.status], fontWeight: 700 }}>
          {statusLabel[result.status]}
        </span>
      </div>
      <div className="cost-kpis" style={{ margin: 0 }}>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Planned</span>
          <span className="cost-kpi__value mono">{minutes(result.totals.plannedLaborMinutes)}</span>
          <span className="cost-kpi__note">{result.totals.taskCount} tasks</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Captured</span>
          <span className="cost-kpi__value mono">{minutes(result.totals.actualLaborMinutes)}</span>
          <span className="cost-kpi__note">{result.totals.reportedTaskCount} reported</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Variance</span>
          <span className="cost-kpi__value mono">{variance(result.totals.varianceMinutes)}</span>
          <span className="cost-kpi__note">{result.totals.missingEvidenceTaskCount} missing evidence</span>
        </div>
      </div>
      {result.rows.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Evidence</th>
                <th style={{ textAlign: 'right' }}>Planned</th>
                <th style={{ textAlign: 'right' }}>Captured</th>
                <th style={{ textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.taskId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.taskCode}</div>
                    <div className="muted">{row.name}</div>
                    {row.notes[0] ? <div style={{ color: '#b54708', marginTop: 4 }}>{row.notes[0]}</div> : null}
                  </td>
                  <td>{row.evidence === 'reported' ? 'Reported' : row.evidence === 'not_due' ? 'Not due' : 'Missing'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{minutes(row.plannedLaborMinutes)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{minutes(row.actualLaborMinutes)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{variance(row.varianceMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-empty">No normalized schedule tasks are available.</div>
      )}
      <div className="muted" style={{ padding: '12px 16px 0', fontSize: 12 }}>{result.notes.join(' ')}</div>
    </section>
  )
}
