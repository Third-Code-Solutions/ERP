import type { BomLocationRollupRow } from '@/app/(dashboard)/projects/[id]/bom/actions'

export function BomLocationRollup({ rows }: { rows: BomLocationRollupRow[] }) {
  if (rows.length === 0) return null

  return (
    <section
      aria-labelledby="bom-location-rollup-heading"
      style={{
        marginBottom: 16,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <h2
          id="bom-location-rollup-heading"
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--color-neutral-900)' }}
        >
          Location rollup
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          Quantities grouped by project location and normalized item description.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Description</th>
              <th>Unit</th>
              <th className="numeric">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.locationId + ':' + row.description + ':' + (row.unit ?? '')}>
                <td style={{ fontWeight: 600 }}>{row.locationName}</td>
                <td>{row.description}</td>
                <td>{row.unit ?? '—'}</td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)' }}>
                  {row.quantity.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
