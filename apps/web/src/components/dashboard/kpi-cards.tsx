import type { KpiData } from '@/lib/dashboard-queries'
import { formatCents, formatCentsCompact } from '@buildops/shared-types'

interface KpiCardsProps {
  kpis: KpiData
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <p
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          margin: '0 0 8px 0',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: '1.375rem',
          fontWeight: 700,
          color: 'var(--color-neutral-900)',
          margin: '0 0 4px 0',
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)', margin: 0 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const gpMargin =
    kpis.activeTcv > 0
      ? ((kpis.activeGp / kpis.activeTcv) * 100).toFixed(1) + '% GP'
      : '—'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '16px',
        marginBottom: '32px',
      }}
    >
      <KpiCard
        label="Active TCV"
        value={formatCentsCompact(kpis.activeTcv)}
        sub={formatCents(kpis.activeTcv)}
      />
      <KpiCard
        label="Active GP"
        value={formatCentsCompact(kpis.activeGp)}
        sub={gpMargin}
      />
      <KpiCard
        label="Closed Won"
        value={formatCentsCompact(kpis.closedWonTcv)}
        sub={formatCents(kpis.closedWonTcv)}
      />
      <KpiCard
        label="Active Deals"
        value={String(kpis.activeDeals)}
        sub={`${formatCentsCompact(kpis.weightedPipeline)} weighted`}
      />
      <KpiCard
        label="Coverage Leads"
        value={String(kpis.coverageLeads)}
      />
    </div>
  )
}
