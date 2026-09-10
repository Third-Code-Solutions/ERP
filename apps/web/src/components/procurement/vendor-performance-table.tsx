import React from 'react'
import type { VendorPerformanceResult, VendorPerformanceRisk } from '@third-code-erp/shared-types'

const riskLabel: Record<VendorPerformanceRisk, string> = {
  new: 'New',
  good: 'Good',
  watch: 'Watch',
  at_risk: 'At risk',
}

const riskColor: Record<VendorPerformanceRisk, string> = {
  new: '#475467',
  good: '#067647',
  watch: '#b54708',
  at_risk: '#b42318',
}

function formatPhp(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatRate(bps: number | null): string {
  return bps === null ? '—' : `${(bps / 100).toFixed(0)}%`
}

export function VendorPerformanceTable({ result }: { result: VendorPerformanceResult }) {
  if (result.rows.length === 0) {
    return <div className="card-empty">No vendor or purchase-order evidence is available for this scope.</div>
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="card-header">
        <div>
          <h2 className="card-title">Vendor performance</h2>
          <p className="card-subtitle">Operational evidence from purchase orders, deliveries, and posted supplier bills.</p>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#667085' }}>
          <span>{result.totals.vendorsWithOrders} with orders</span>
          <span>{result.totals.atRiskCount} at risk</span>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Signal</th>
            <th style={{ textAlign: 'right' }}>POs</th>
            <th style={{ textAlign: 'right' }}>On time</th>
            <th style={{ textAlign: 'right' }}>Accepted</th>
            <th style={{ textAlign: 'right' }}>Avg lead</th>
            <th style={{ textAlign: 'right' }}>Committed</th>
            <th style={{ textAlign: 'right' }}>Posted spend</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.vendorId}>
              <td>
                <div style={{ fontWeight: 600 }}>{row.vendorName}</div>
                {row.notes.length > 0 ? (
                  <div className="muted" style={{ marginTop: 4, maxWidth: 360 }}>{row.notes[0]}</div>
                ) : null}
              </td>
              <td>
                <span style={{ color: riskColor[row.risk], fontWeight: 700 }}>{riskLabel[row.risk]}</span>
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {row.poCount} <span className="muted">({row.openPoCount} open)</span>
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {formatRate(row.onTimeRateBps)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {formatRate(row.acceptanceRateBps)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {row.averageLeadTimeDays === null ? '—' : `${row.averageLeadTimeDays}d`}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {formatPhp(row.committedCents)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {formatPhp(row.postedSpendCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ padding: '12px 16px 0', fontSize: 12 }}>
        Rates are evidence ratios, not a credit score. Missing deliveries and unposted bills remain visible as caveats.
      </div>
    </div>
  )
}
