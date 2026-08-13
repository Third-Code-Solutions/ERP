import type { Metadata } from 'next'
import { requireUserProfile } from '@third-code-erp/auth'
import {
  getProcessHealthThroughCoreApi,
} from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Process Health' }

function number(value: number): string {
  return value.toLocaleString('en-PH')
}

export default async function ProcessHealthPage() {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) {
    return (
      <div className="page-header">
        <h1 className="page-title">Process Health</h1>
        <p className="page-subtitle">You must be signed in to view process health.</p>
      </div>
    )
  }

  const result = await getProcessHealthThroughCoreApi()
  const health = result.ok ? result.data : null
  const totals = health?.byBu.reduce(
    (summary, bu) => ({
      openTasks: summary.openTasks + bu.openTasks,
      atRiskClocks: summary.atRiskClocks + bu.atRiskClocks,
      breachedClocks: summary.breachedClocks + bu.breachedClocks,
      escalatedClocks: summary.escalatedClocks + bu.escalatedClocks,
      externalBreachedClocks:
        summary.externalBreachedClocks + bu.externalBreachedClocks,
    }),
    {
      openTasks: 0,
      atRiskClocks: 0,
      breachedClocks: 0,
      escalatedClocks: 0,
      externalBreachedClocks: 0,
    },
  )

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Operations</p>
        <h1 className="page-title">Process Health</h1>
        <p className="page-subtitle">
          BU-level SLA visibility. External clocks stay observable and never
          escalate against an ABI BU.
        </p>
      </div>

      {!health ? (
        <section className="card" aria-labelledby="process-health-unavailable">
          <div className="card-header">
            <h2 id="process-health-unavailable" className="card-title">
              Verified health data unavailable
            </h2>
          </div>
          <div className="card-empty" role="alert">
            {result.error ?? 'Core API returned no process-health data.'} No
            synthetic process metrics are shown.
          </div>
        </section>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginBottom: 24,
              flexWrap: 'wrap',
            }}
            aria-label="Process health summary"
          >
            {[
              { label: 'Open tasks', value: totals?.openTasks ?? 0 },
              { label: 'At risk', value: totals?.atRiskClocks ?? 0 },
              { label: 'Breached', value: totals?.breachedClocks ?? 0 },
              { label: 'Escalated', value: totals?.escalatedClocks ?? 0 },
              {
                label: 'External breaches',
                value: totals?.externalBreachedClocks ?? 0,
              },
            ].map((metric) => (
              <div
                className="card"
                key={metric.label}
                style={{ minWidth: 150, flex: '1 1 150px' }}
              >
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {metric.label}
                </div>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    marginTop: 6,
                  }}
                >
                  {number(metric.value)}
                </div>
              </div>
            ))}
          </div>

          <section className="card" aria-labelledby="process-health-by-bu">
            <div className="card-header">
              <div>
                <h2 id="process-health-by-bu" className="card-title">
                  Health by business unit
                </h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  {health.observeMode
                    ? 'Observe mode active. Escalation remains suppressed during the initial BU observation period.'
                    : 'Escalation mode active for internal clocks.'}
                </p>
              </div>
              <span
                className="badge"
                style={{
                  background: health.observeMode
                    ? 'var(--color-warning-soft)'
                    : 'var(--color-success-soft)',
                  color: health.observeMode
                    ? 'var(--color-warning)'
                    : 'var(--color-success)',
                }}
              >
                {health.observeMode ? 'Observe' : 'Enforce'}
              </span>
            </div>

            {health.byBu.length === 0 ? (
              <div className="card-empty">
                No source-backed process steps are loaded yet. SD Framework
                seed data is required before workflow metrics can appear.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <caption className="sr-only">
                    Process health metrics grouped by responsible business unit
                  </caption>
                  <thead>
                    <tr>
                      <th>Business unit</th>
                      <th className="numeric">Open tasks</th>
                      <th className="numeric">At risk</th>
                      <th className="numeric">Breached</th>
                      <th className="numeric">Escalated</th>
                      <th className="numeric">External breach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.byBu.map((bu) => (
                      <tr key={bu.responsibleBu}>
                        <th scope="row">{bu.responsibleBu}</th>
                        <td className="numeric">{number(bu.openTasks)}</td>
                        <td className="numeric">{number(bu.atRiskClocks)}</td>
                        <td className="numeric">{number(bu.breachedClocks)}</td>
                        <td className="numeric">{number(bu.escalatedClocks)}</td>
                        <td className="numeric">
                          {number(bu.externalBreachedClocks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="muted" style={{ marginTop: 16, fontSize: '0.75rem' }}>
              Generated {new Date(health.generatedAt).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Manila',
              })}{' '}
              for {profile.fullName || profile.email}.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
