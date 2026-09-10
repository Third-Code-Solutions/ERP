import React from 'react'
import type {
  ProjectCloseoutReadinessResult,
  ProjectCloseoutReadinessStatus,
} from '@third-code-erp/shared-types'

const statusLabel: Record<ProjectCloseoutReadinessStatus, string> = {
  ready: 'Evidence complete',
  partial: 'Close-out blockers',
  unavailable: 'No close-out evidence',
}

const statusColor: Record<ProjectCloseoutReadinessStatus, string> = {
  ready: '#067647',
  partial: '#b54708',
  unavailable: '#667085',
}

function formatPhpCentavos(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

export function ProjectCloseoutReadinessCard({
  result,
}: {
  result: ProjectCloseoutReadinessResult
}) {
  return (
    <section className="card" aria-labelledby="project-closeout-readiness-title" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <h2 className="card-title" id="project-closeout-readiness-title">Financial close-out evidence</h2>
          <p className="card-subtitle">Bond, retention, and P&L evidence from current source records.</p>
        </div>
        <span style={{ color: statusColor[result.status], fontWeight: 700 }}>{statusLabel[result.status]}</span>
      </div>
      <div className="cost-kpis" style={{ margin: 0 }}>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Bonds</span>
          <span className="cost-kpi__value mono">{result.bonds.refunded}/{result.bonds.total}</span>
          <span className="cost-kpi__note">Refund evidence</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Open bonds</span>
          <span className="cost-kpi__value mono">{result.bonds.open}</span>
          <span className="cost-kpi__note">No refund evidence</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Open retention</span>
          <span className="cost-kpi__value mono">{formatPhpCentavos(result.retention.openCentavos)}</span>
          <span className="cost-kpi__note">{result.retention.invoiceCount} invoice(s)</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">P&amp;L close-out</span>
          <span className="cost-kpi__value">{result.pnlCloseoutStatus === 'available' ? 'Available' : 'Unavailable'}</span>
          <span className="cost-kpi__note">Separate from SAP statutory books</span>
        </div>
      </div>
      {result.blockers.length > 0 ? <ul style={{ margin: '14px 16px 0', color: '#b54708' }}>{result.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p style={{ margin: '14px 16px 0', color: '#067647' }}>No blockers in the represented evidence.</p>}
      <p className="muted" style={{ margin: '12px 16px 16px', fontSize: 12 }}>{result.notes.join(' ')}</p>
    </section>
  )
}
