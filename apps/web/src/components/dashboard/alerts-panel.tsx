import Link from 'next/link'
import type { Alert } from '@/lib/dashboard-queries'
import {
  IconAlert,
  IconClock,
  IconArrowDownRight,
  IconTrendingDown,
  IconCheck,
} from '@/components/ui/icons'

const ALERT_ICONS: Record<Alert['type'], (props: { size?: number }) => React.ReactElement> = {
  low_margin: (p) => <IconTrendingDown {...p} />,
  stalled_deal: (p) => <IconClock {...p} />,
  overdue_invoice: (p) => <IconAlert {...p} />,
  gp_erosion: (p) => <IconArrowDownRight {...p} />,
  gp_erosion_actual: (p) => <IconArrowDownRight {...p} />,
}

interface AlertsPanelProps {
  alerts: Alert[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const danger = alerts.filter((a) => a.severity === 'danger')
  const warning = alerts.filter((a) => a.severity === 'warning')

  return (
    <section
      className="card"
      aria-labelledby="risk-signals-heading"
      style={{ height: 'fit-content' }}
    >
      <div className="card-header">
        <div>
          <h2 className="card-title" id="risk-signals-heading">
            Risk Signals
          </h2>
          <p className="card-subtitle">
            {alerts.length === 0
              ? 'All systems nominal'
              : `${alerts.length} ${alerts.length === 1 ? 'item needs' : 'items need'} attention`}
          </p>
        </div>
        {alerts.length > 0 ? (
          <span
            aria-label={`${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: danger.length > 0 ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
              color: danger.length > 0 ? 'var(--color-danger)' : 'var(--color-warning)',
            }}
          >
            {alerts.length}
          </span>
        ) : null}
      </div>

      {alerts.length === 0 ? (
        <div
          className="alert-empty"
          role="status"
          aria-live="polite"
        >
          <div className="alert-empty-icon" aria-hidden>
            <IconCheck size={18} />
          </div>
          <p className="alert-empty-title">No active alerts</p>
          <p className="alert-empty-detail">
            Margin, billing and procurement all within tolerance.
          </p>
        </div>
      ) : (
        <div
          className="alerts-list"
          role="status"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {danger.length > 0 ? (
            <>
              <div className="alert-group-label" role="heading" aria-level={3}>
                Critical
              </div>
              {danger.map((alert, idx) => (
                <AlertRow key={`d-${idx}`} alert={alert} />
              ))}
            </>
          ) : null}
          {warning.length > 0 ? (
            <>
              <div className="alert-group-label" role="heading" aria-level={3}>
                Warning
              </div>
              {warning.map((alert, idx) => (
                <AlertRow key={`w-${idx}`} alert={alert} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = ALERT_ICONS[alert.type] ?? ((p: { size?: number }) => <IconAlert {...p} />)
  const markerCls = alert.severity === 'danger' ? 'is-danger' : 'is-warning'
  const severityLabel = alert.severity === 'danger' ? 'Critical' : 'Warning'
  return (
    <Link
      href={alert.href}
      className="alert-item"
      aria-label={`${severityLabel}: ${alert.label}. ${alert.detail}`}
    >
      <div className={`alert-marker ${markerCls}`} aria-hidden>
        <Icon size={14} />
      </div>
      <div className="alert-body">
        <span className="sr-only">{severityLabel}: </span>
        <p className="alert-title">{alert.label}</p>
        <p className="alert-detail">{alert.detail}</p>
      </div>
    </Link>
  )
}
