'use client'

/**
 * Price comparison matrix (REFACTOR.md M3 US-013).
 *
 * Rows = RFQ line items. Columns = vendors that submitted a quote on this
 * RFQ. Cell = unit price in ₱ + lead time. Lowest price per row is
 * highlighted so Commercial can pick the winner at a glance.
 */

interface LineItem {
  material_item_id: string | null
  code: string | null
  description: string
  unit: string | null
  qty: number
}

interface Quote {
  id: string
  vendor_id: string
  vendor_name: string
  material_item_id: string | null
  material_code: string | null
  unit_price_cents: number
  lead_time_days: number | null
}

interface Props {
  lineItems: LineItem[]
  quotes: Quote[]
}

function formatPhp(cents: number): string {
  return (cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function quoteMatchesLine(q: Quote, l: LineItem): boolean {
  if (l.material_item_id && q.material_item_id === l.material_item_id) return true
  if (l.code && q.material_code === l.code) return true
  return false
}

export function PriceComparisonTable({ lineItems, quotes }: Props) {
  // Distinct vendors in stable name order.
  const vendorMap = new Map<string, string>()
  for (const q of quotes) vendorMap.set(q.vendor_id, q.vendor_name)
  const vendorList = [...vendorMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (vendorList.length === 0) {
    return <div className="card-empty">No vendor quotes to compare yet.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Line</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            {vendorList.map((v) => (
              <th key={v.id} style={{ textAlign: 'right' }}>
                {v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((l, idx) => {
            // Per-vendor cheapest quote for this line.
            const perVendor = new Map<string, Quote>()
            for (const q of quotes) {
              if (!quoteMatchesLine(q, l)) continue
              const prev = perVendor.get(q.vendor_id)
              if (!prev || q.unit_price_cents < prev.unit_price_cents) {
                perVendor.set(q.vendor_id, q)
              }
            }
            const lowestPrice = Math.min(
              ...[...perVendor.values()].map((q) => q.unit_price_cents)
            )

            return (
              <tr key={idx}>
                <td>
                  <div style={{ fontWeight: 500 }}>{l.description}</div>
                  {l.code && (
                    <div className="muted" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {l.code}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {l.qty.toLocaleString('en-PH')}
                  {l.unit ? <span className="muted"> {l.unit}</span> : null}
                </td>
                {vendorList.map((v) => {
                  const q = perVendor.get(v.id)
                  if (!q) {
                    return (
                      <td key={v.id} className="muted" style={{ textAlign: 'right' }}>
                        —
                      </td>
                    )
                  }
                  const isLowest =
                    perVendor.size > 0 && q.unit_price_cents === lowestPrice
                  return (
                    <td
                      key={v.id}
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isLowest ? 600 : 400,
                        background: isLowest ? '#ecfdf3' : undefined,
                        color: isLowest ? '#067647' : 'inherit',
                      }}
                    >
                      ₱{formatPhp(q.unit_price_cents)}
                      {q.lead_time_days != null && (
                        <div
                          className="muted"
                          style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                        >
                          {q.lead_time_days}d lead
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
