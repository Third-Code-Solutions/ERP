import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { getProcessHealthThroughCoreApi } from '@/lib/erp-core-client'
import { ProcessRetry } from './retry'
import styles from './process.module.css'

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
  const hasActivity = Boolean(health?.byBu.length)
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
          Review overdue work and upcoming deadlines by business unit. External delays are tracked separately from your team’s deadlines.
        </p>
      </div>

      {!health ? (
        <section className="card" aria-labelledby="process-health-unavailable">
          <div className="card-header">
            <h2 id="process-health-unavailable" className="card-title">
              Process health could not be loaded
            </h2>
          </div>
          <div className="card-empty" role="alert">
            <p>We could not retrieve the latest workflow deadlines. Try again; if the problem continues, contact your workspace administrator.</p>
            <ProcessRetry />
          </div>
        </section>
      ) : (
        <>
          {hasActivity && (
            <dl className={styles.summary} aria-label="Process health summary">
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
                <div className={`card ${styles.metric}`} key={metric.label}>
                  <dt className={styles.metricLabel}>{metric.label}</dt>
                  <dd className={styles.metricValue}>{number(metric.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className="card" aria-labelledby="process-health-by-bu">
            <div className={`card-header ${styles.header}`}>
              <div>
                <h2 id="process-health-by-bu" className="card-title">
                  Health by business unit
                </h2>
                <p className={styles.description}>
                  Open workflow tasks and deadlines, grouped by responsible team.
                </p>
              </div>
            </div>

            {health.byBu.length === 0 ? (
              <div className={styles.empty}>
                <h3>No workflow activity yet</h3>
                <p>
                  Business-unit metrics appear when workflow tasks and deadlines
                  are tracked. Daily site tasks are listed separately in My Tasks.
                </p>
                <div className={styles.actions}>
                  <Link className="button-primary" href="/tasks">
                    Open my tasks
                  </Link>
                  <Link className="button-secondary" href="/projects">
                    View projects
                  </Link>
                </div>
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

            {hasActivity && (
              <p className={styles.mode}>
                {health.observeMode
                  ? 'Deadlines are being monitored. Automatic escalation is off.'
                  : 'Automatic escalation is enabled for eligible internal deadlines.'}
                {' '}External delays do not trigger escalation against your team.
              </p>
            )}
            <p className={styles.footer}>
              Updated {new Date(health.generatedAt).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Manila',
              })} PHT
            </p>
          </section>
        </>
      )}
    </div>
  )
}
