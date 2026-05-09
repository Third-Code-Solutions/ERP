import Link from 'next/link'
import type { Alert } from '@/lib/dashboard-queries'

const ALERT_ICONS: Record<Alert['type'], string> = {
  low_margin: '▼',
  stalled_deal: '⏸',
  overdue_invoice: '!',
}

const SEVERITY_COLORS: Record<Alert['severity'], { bg: string; border: string; icon: string; text: string }> = {
  danger: { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444', text: '#7f1d1d' },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '#d97706', text: '#78350f' },
}

interface AlertsPanelProps {
  alerts: Alert[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: alerts.length > 0 ? '1px solid var(--color-border)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-800)', margin: 0 }}>
          Alerts
        </h2>
        {alerts.length > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: alerts.some((a) => a.severity === 'danger') ? '#ef4444' : '#d97706',
              color: 'white',
              fontSize: '0.6875rem',
              fontWeight: 700,
            }}
          >
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-400)', margin: 0 }}>
            No active alerts
          </p>
        </div>
      ) : (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map((alert, idx) => {
            const colors = SEVERITY_COLORS[alert.severity]
            return (
              <Link
                key={idx}
                href={alert.href}
                style={{
                  display: 'flex',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: colors.icon,
                    color: 'white',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '1px',
                  }}
                >
                  {ALERT_ICONS[alert.type]}
                </span>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.text, marginBottom: '1px' }}>
                    {alert.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.text, opacity: 0.8 }}>
                    {alert.detail}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
