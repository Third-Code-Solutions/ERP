import type { KpiData } from '@/lib/dashboard-queries'
import React from 'react'
import { formatCents, formatCentsCompact } from '@third-code-erp/shared-types'
import { IconArrowUpRight, IconActivity, IconUser } from '@/components/ui/icons'

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
  const labelId = `kpi-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <article
      className={`kpi-card${feature ? ' is-feature' : ''}`}
      aria-labelledby={labelId}
    >
      <h3 className="kpi-card-label" id={labelId}>
        <span>{label}</span>
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
        label="Active Pipeline TCV"
        value={formatCentsCompact(kpis.activeTcv)}
        sub={`${formatCents(kpis.activeTcv)} across ${kpis.activeDeals} deals`}
        fillPct={Math.min(100, weightedRatio)}
        badge={
          <span className="delta is-up">
            <span aria-hidden style={{ display: 'inline-flex' }}>
              <IconArrowUpRight size={11} />
            </span>
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
        label="Closed Won"
        value={formatCentsCompact(kpis.closedWonTcv)}
        sub={formatCents(kpis.closedWonTcv)}
        badge={
          <span aria-hidden style={{ color: 'var(--color-neutral-400)', display: 'inline-flex' }}>
            <IconActivity size={12} />
          </span>
        }
      />
      <KpiCard
        label="Coverage Leads"
        value={kpis.coverageLeads.toLocaleString()}
        sub={`${kpis.coverageLeads === 1 ? 'lead' : 'leads'} in opportunity_creation`}
        badge={
          <span aria-hidden style={{ color: 'var(--color-neutral-400)', display: 'inline-flex' }}>
            <IconUser size={12} />
          </span>
        }
      />
    </section>
  )
}
