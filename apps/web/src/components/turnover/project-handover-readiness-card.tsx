import React from 'react'
import type {
  ProjectHandoverReadinessResult,
  ProjectHandoverReadinessStatus,
} from '@third-code-erp/shared-types'

const statusLabel: Record<ProjectHandoverReadinessStatus, string> = {
  ready: 'Ready for handover',
  partial: 'Blocked by evidence',
  unavailable: 'No handover evidence',
}

const statusColor: Record<ProjectHandoverReadinessStatus, string> = {
  ready: '#067647',
  partial: '#b54708',
  unavailable: '#667085',
}

export function ProjectHandoverReadinessCard({
  result,
}: {
  result: ProjectHandoverReadinessResult
}) {
  return (
    <section className="card" aria-labelledby="project-handover-readiness-title" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <h2 className="card-title" id="project-handover-readiness-title">Handover readiness</h2>
          <p className="card-subtitle">Controlled evidence gate across turnover, COC, punchlist, and occupancy.</p>
        </div>
        <span style={{ color: statusColor[result.status], fontWeight: 700 }}>{statusLabel[result.status]}</span>
      </div>
      <div className="cost-kpis" style={{ margin: 0 }}>
        <div className="cost-kpi"><span className="cost-kpi__label">Turnover documents</span><span className="cost-kpi__value mono">{result.attachedSlotCount}/{result.requiredSlotCount}</span><span className="cost-kpi__note">{result.turnoverCompiled ? 'Compiled' : 'Not compiled'}</span></div>
        <div className="cost-kpi"><span className="cost-kpi__label">COC</span><span className="cost-kpi__value">{result.cocStatus ? result.cocStatus.replaceAll('_', ' ') : 'Not created'}</span><span className="cost-kpi__note">Signature evidence</span></div>
        <div className="cost-kpi"><span className="cost-kpi__label">Punchlist</span><span className="cost-kpi__value mono">{result.openPunchlistCount} open</span><span className="cost-kpi__note">{result.totalPunchlistCount} total</span></div>
        <div className="cost-kpi"><span className="cost-kpi__label">Occupancy</span><span className="cost-kpi__value">{result.occupancyPermitStatus ? result.occupancyPermitStatus.replaceAll('_', ' ') : 'Not recorded'}</span><span className="cost-kpi__note">Permit evidence</span></div>
      </div>
      {result.blockers.length > 0 ? <ul style={{ margin: '14px 16px 0', color: '#b54708' }}>{result.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p style={{ margin: '14px 16px 0', color: '#067647' }}>All current handover evidence gates are complete.</p>}
      <p className="muted" style={{ margin: '12px 16px 16px', fontSize: 12 }}>{result.notes.join(' ')}</p>
    </section>
  )
}
