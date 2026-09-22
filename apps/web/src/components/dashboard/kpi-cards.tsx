import type { KpiData } from '@/lib/dashboard-queries'
import { formatCents, formatCentsCompact } from '@third-code-erp/shared-types'
import {
  IconActivity,
  IconArrowUpRight,
  IconCheck,
  IconPipeline,
  IconTrendingUp,
  IconUser,
} from '@/components/ui/icons'

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
  icon?: React.ReactNode
}

function KpiCard({ label, value, sub, feature = false, fillPct, badge, icon }: KpiCardProps) {
  const labelId = `kpi-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <article
      className={`kpi-card${feature ? ' is-feature' : ''}`}
      aria-labelledby={labelId}
    >
      <h3 className="kpi-card-label" id={labelId}>
        <span className="kpi-card-label-copy">
          <span className="kpi-card-icon" aria-hidden>
            {icon}
          </span>
          <span>{label}</span>
        </span>
        {badge ?? null}
      </h3>
      <p className="kpi-card-value" aria-describedby={labelId}>
        {value}
      </p>
      {sub ? <p className="kpi-card-sub">{sub}</p> : null}
      {typeof fillPct === 'number' ? (
        <div className="kpi-card-bar" aria-hidden>
          <div
            className="kpi-card-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, fillPct))}%` }}
          />
        </div>
      ) : null}
    </article>
  )
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const gpMarginPct = kpis.activeTcv > 0 ? (kpis.activeGp / kpis.activeTcv) * 100 : 0
  const weightedRatio =
    kpis.activeTcv > 0 ? (kpis.weightedPipeline / kpis.activeTcv) * 100 : 0

  return (
    <section className="kpi-grid" aria-labelledby="kpi-section-heading">
      <h2 id="kpi-section-heading" className="sr-only">
        Key performance indicators
      </h2>
      <KpiCard
        feature
        icon={<IconPipeline size={15} />}
        label="Active Pipeline TCV"
        value={formatCentsCompact(kpis.activeTcv)}
        sub={`${formatCents(kpis.activeTcv)} across ${kpis.activeDeals} deals`}
        fillPct={Math.min(100, weightedRatio)}
        badge={
          <span className="delta is-up">
            <span className="kpi-card-badge-icon" aria-hidden>
              <IconArrowUpRight size={11} />
            </span>
            Live
          </span>
        }
      />
      <KpiCard
        icon={<IconTrendingUp size={15} />}
        label="Active GP"
        value={formatCentsCompact(kpis.activeGp)}
        sub={`${gpMarginPct.toFixed(1)}% blended margin`}
        fillPct={Math.min(100, gpMarginPct * 2)}
      />
      <KpiCard
        icon={<IconActivity size={15} />}
        label="Weighted Pipeline"
        value={formatCentsCompact(kpis.weightedPipeline)}
        sub={`${weightedRatio.toFixed(0)}% of active TCV`}
        fillPct={Math.min(100, weightedRatio)}
      />
      <KpiCard
        icon={<IconCheck size={15} />}
        label="Closed Won FYTD"
        value={formatCentsCompact(kpis.closedWonTcv)}
        sub={formatCents(kpis.closedWonTcv)}
        badge={
          <span aria-hidden className="kpi-card-badge-icon">
            <IconActivity size={12} />
          </span>
        }
      />
      <KpiCard
        icon={<IconUser size={15} />}
        label="Coverage Leads"
        value={kpis.coverageLeads.toLocaleString()}
        sub={`${kpis.coverageLeads === 1 ? 'lead' : 'leads'} at initial pipeline stage`}
        badge={
          <span aria-hidden className="kpi-card-badge-icon">
            <IconUser size={12} />
          </span>
        }
      />
    </section>
  )
}
