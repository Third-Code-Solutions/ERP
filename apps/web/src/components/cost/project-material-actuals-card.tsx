import React from 'react'
import type {
  ProjectMaterialActualsResult,
  ProjectMaterialActualsStatus,
} from '@third-code-erp/shared-types'

const statusLabel: Record<ProjectMaterialActualsStatus, string> = {
  ready: 'Ready',
  partial: 'Partial evidence',
  unavailable: 'No posted evidence',
}

const statusColor: Record<ProjectMaterialActualsStatus, string> = {
  ready: '#067647',
  partial: '#b54708',
  unavailable: '#667085',
}

function formatPhp(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatQuantity(micros: number): string {
  return (micros / 1_000_000).toLocaleString('en-PH', {
    maximumFractionDigits: 3,
  })
}

export function ProjectMaterialActualsCard({
  result,
}: {
  result: ProjectMaterialActualsResult
}) {
  return (
    <section className="card" aria-labelledby="project-material-actuals-title">
      <div className="card-header">
        <div>
          <h3 className="card-title" id="project-material-actuals-title">
            Inventory actuals
          </h3>
          <p className="card-subtitle">
            Posted goods receipts and project consumption issues, kept separate
            from posted supplier-bill actual cost.
          </p>
        </div>
        <span style={{ color: statusColor[result.status], fontWeight: 700 }}>
          {statusLabel[result.status]}
        </span>
      </div>

      <div className="cost-kpis" style={{ margin: 0 }}>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Received value</span>
          <span className="cost-kpi__value mono">
            {formatPhp(result.totals.receivedValueCents)}
          </span>
          <span className="cost-kpi__note">{result.totals.receiptCount} posted GR</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Issued value</span>
          <span className="cost-kpi__value mono">
            {formatPhp(result.totals.issuedValueCents)}
          </span>
          <span className="cost-kpi__note">{result.totals.issueCount} posted issues</span>
        </div>
        <div className="cost-kpi">
          <span className="cost-kpi__label">Receipt balance signal</span>
          <span className="cost-kpi__value mono">
            {formatPhp(result.totals.remainingValueCents)}
          </span>
          <span className="cost-kpi__note">Operational evidence only</span>
        </div>
      </div>

      {result.rows.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th style={{ textAlign: 'right' }}>Received</th>
                <th style={{ textAlign: 'right' }}>Issued</th>
                <th style={{ textAlign: 'right' }}>Issued value</th>
                <th style={{ textAlign: 'right' }}>Balance signal</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.materialItemId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.code}</div>
                    <div className="muted">{row.description}</div>
                    {row.notes[0] ? (
                      <div style={{ color: '#b54708', marginTop: 4 }}>{row.notes[0]}</div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatQuantity(row.receivedQuantityMicros)} {row.unit}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatQuantity(row.issuedQuantityMicros)} {row.unit}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatPhp(row.issuedValueCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatPhp(row.remainingValueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-empty">No posted inventory evidence is available for this project.</div>
      )}

      <div className="muted" style={{ padding: '12px 16px 0', fontSize: 12 }}>
        {result.notes.join(' ')}
      </div>
    </section>
  )
}
