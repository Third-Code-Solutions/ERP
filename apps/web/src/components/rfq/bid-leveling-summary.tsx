import React from 'react'
import type { RfqBidLevelingResult } from '@third-code-erp/shared-types'

function formatPhp(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function BidLevelingSummary({ result }: { result: RfqBidLevelingResult }) {
  return (
    <section className="card" aria-labelledby="bid-leveling-heading">
      <div className="card-header">
        <div>
          <h2 id="bid-leveling-heading" className="card-title">Bid-leveling evidence</h2>
          <p className="card-subtitle">Coverage, price floor, freshness, and award evidence. No automatic winner is selected.</p>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Stale after {result.staleAfterDays} days</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Covered lines" value={`${result.coveredLineCount}/${result.totalLineCount}`} />
        <Metric label="Vendors" value={String(result.vendorCount)} />
        <Metric label="Stale quotes" value={String(result.staleQuoteCount)} />
        <Metric label="Awarded quotes" value={String(result.awardedQuoteCount)} />
      </div>
      {result.lines.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Line</th><th style={{ textAlign: 'right' }}>Lowest unit price</th><th style={{ textAlign: 'right' }}>Quotes</th><th>Freshness</th></tr></thead>
            <tbody>
              {result.lines.map((line) => {
                const staleCount = line.quotes.filter((quote) => quote.isStale).length
                return (
                  <tr key={line.lineKey}>
                    <td>{line.description}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.lowestUnitPriceCents === null ? '—' : formatPhp(line.lowestUnitPriceCents)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.quotes.length}</td>
                    <td style={{ color: staleCount > 0 ? '#b54708' : '#067647', fontWeight: 600 }}>{staleCount > 0 ? `${staleCount} stale` : 'Current'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="card-empty">No RFQ lines are available for bid leveling.</div>}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px' }}><div className="muted" style={{ fontSize: 11 }}>{label}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div></div>
}
