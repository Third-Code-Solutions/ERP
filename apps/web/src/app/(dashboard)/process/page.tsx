import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { getProcessHealthThroughCoreApi } from '@/lib/erp-core-client'
import { IconActivity, IconArrowUpRight, IconClock } from '@/components/ui/icons'
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
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1 className={styles.pageTitle}>Process Health</h1>
          <p className={styles.introduction}>
            Track workflow deadlines and the work that needs your team’s attention.
          </p>
        </div>
        {health && (
          <div className={styles.refresh}>
            <ProcessRetry label="Refresh" pendingLabel="Refreshing…" />
            <time
              className={styles.timestamp}
              dateTime={health.generatedAt}
              title={new Date(health.generatedAt).toLocaleString('en-PH', {
                dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
              })}
            >
              Updated {new Date(health.generatedAt).toLocaleTimeString('en-PH', {
                hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
              })} PHT
            </time>
          </div>
        )}
      </header>

      {!health ? (
        <section className={styles.panel} aria-labelledby="process-health-unavailable">
          <div className={styles.header}>
            <h2 id="process-health-unavailable" className="card-title">
              Process health could not be loaded
            </h2>
          </div>
          <div className={styles.failure} role="alert">
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
                <div className={styles.metric} key={metric.label}>
                  <dt className={styles.metricLabel}>{metric.label}</dt>
                  <dd className={styles.metricValue}>{number(metric.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className={styles.layout}>
            <section className={styles.panel} aria-labelledby="process-health-by-bu">
              <div className={styles.header}>
                <IconActivity size={18} />
                <div className={styles.sectionHeading}>
                  <h2 id="process-health-by-bu" className="card-title">
                    Health by business unit
                  </h2>
                </div>
              </div>

              {health.byBu.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <IconClock size={26} />
                  </div>
                  <div className={styles.emptyContent}>
                    <h3>No open workflow tasks</h3>
                    <p>
                      Workflow deadlines appear here by business unit.
                      Daily site tasks are available in My Tasks.
                    </p>
                    <div className={styles.actions}>
                      <Link className="button-primary" href="/tasks">
                        Open my tasks
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={`data-table ${styles.table}`}>
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
            </section>
            <aside className={styles.guide} aria-labelledby="process-status-guide">
              <h2 id="process-status-guide">Reading this view</h2>
              <dl className={styles.definitions}>
                <div>
                  <dt><span className={styles.riskMark} />At risk</dt>
                  <dd>A tracked deadline is approaching its target.</dd>
                </div>
                <div>
                  <dt><span className={styles.breachMark} />Breached</dt>
                  <dd>A tracked deadline has passed its due time.</dd>
                </div>
                <div>
                  <dt><span className={styles.externalMark} />External delays</dt>
                  <dd>Tracked separately. These do not trigger escalation against your team.</dd>
                </div>
              </dl>
              <Link className={styles.projectLink} href="/projects">
                View projects <IconArrowUpRight size={16} />
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
