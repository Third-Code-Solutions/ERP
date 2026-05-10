import type { KpiData } from '@/lib/dashboard-queries'
import { formatCents, formatCentsCompact } from '@buildops/shared-types'
import { IconArrowUpRight, IconActivity } from '@/components/ui/icons'

interface KpiCardsProps {
  kpis: KpiData
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  feature?: boolean
  fillPct?: number
  badge?: React.ReactNode
}

function KpiCard({ label, value, sub, feature = false, fillPct, badge }: KpiCardProps) {
  return (
    <div className={`kpi-card${feature ? ' is-feature' : ''}`}>
      <p className="kpi-card-label">
        <span>{label}</span>
        {badge ?? null}
      </p>
      <p className="kpi-card-value">{value}</p>
      {sub ? <p className="kpi-card-sub">{sub}</p> : null}
      {typeof fillPct === 'number' ? (
        <div className="kpi-card-bar" aria-hidden>
          <div
            className="kpi-card-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, fillPct))}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const gpMarginPct = kpis.activeTcv > 0 ? (kpis.activeGp / kpis.activeTcv) * 100 : 0
  const weightedRatio =
    kpis.activeTcv > 0 ? (kpis.weightedPipeline / kpis.activeTcv) * 100 : 0

  return (
    <div className="kpi-grid">
      <KpiCard
        feature
        label="Active Pipeline TCV"
        value={formatCentsCompact(kpis.activeTcv)}
        sub={`${formatCents(kpis.activeTcv)} across ${kpis.activeDeals} deals`}
        fillPct={Math.min(100, weightedRatio)}
        badge={
          <span className="delta is-up">
            <IconArrowUpRight size={11} />
            Live
          </span>
        }
      />
      <KpiCard
        label="Active GP"
        value={formatCentsCompact(kpis.activeGp)}
        sub={`${gpMarginPct.toFixed(1)}% blended margin`}
        fillPct={Math.min(100, gpMarginPct * 2)}
      />
      <KpiCard
        label="Weighted Pipeline"
        value={formatCentsCompact(kpis.weightedPipeline)}
        sub={`${weightedRatio.toFixed(0)}% of active TCV`}
        fillPct={Math.min(100, weightedRatio)}
      />
      <KpiCard
        label="Closed Won (YTD)"
        value={formatCentsCompact(kpis.closedWonTcv)}
        sub={formatCents(kpis.closedWonTcv)}
        badge={
          <span style={{ color: 'var(--color-neutral-400)', display: 'inline-flex' }}>
            <IconActivity size={12} />
          </span>
        }
      />
    </div>
  )
}
