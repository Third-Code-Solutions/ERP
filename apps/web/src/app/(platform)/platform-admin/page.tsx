import Link from 'next/link'

import { getPlatformOverview } from '@/lib/platform-admin-client'
import {
  MetricCard,
  EmptyPlatformState,
  PlatformFlash,
  PlatformPageHeader,
  PlatformUnavailable,
  StatusPill,
} from './_components'

export default async function PlatformOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const [params, result] = await Promise.all([searchParams, getPlatformOverview()])
  return (
    <>
      <PlatformPageHeader
        title="Platform overview"
        description="Global tenant health, user lifecycle, operational activity, and explicit support context."
      />
      <PlatformFlash notice={params.notice} error={params.error} />
      {!result.ok ? (
        <PlatformUnavailable message={result.error} />
      ) : (
        <div className="platform-stack">
          <section className="platform-metric-grid" aria-label="Platform summary">
            <MetricCard label="Active tenants" value={result.data.analytics.tenants.active} detail={`${result.data.analytics.tenants.total} total`} />
            <MetricCard label="Active users" value={result.data.analytics.users.active} detail={`${result.data.analytics.users.invited} invitations pending`} />
            <MetricCard label="Active projects" value={result.data.analytics.projects.active} detail={`${result.data.analytics.projects.total} total records`} />
            <MetricCard label="Open opportunities" value={result.data.analytics.opportunities.open} detail={`${result.data.analytics.opportunities.total} total`} />
          </section>

          {!result.data.activeSupportSession ? <section className="card platform-support-banner is-neutral">
            <div>
              <p className="page-eyebrow">Support context</p>
              <h2>No tenant context is active</h2>
              <p>Start a time-bounded, reasoned context from the Tenants view before providing support.</p>
            </div>
            <Link className="button button-secondary" href="/platform-admin/tenants">Select tenant</Link>
          </section> : null}

          <section className="card">
            <div className="card-header">
              <div><h2 className="card-title">Recent privileged activity</h2><p className="card-subtitle">Append-only platform audit evidence</p></div>
              <Link href="/platform-admin/audit">View audit</Link>
            </div>
            {result.data.recentAudit.length === 0 ? <EmptyPlatformState>No privileged activity recorded yet.</EmptyPlatformState> : null}
            <div className="platform-table-wrap">
              <table className="data-table">
                <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Outcome</th></tr></thead>
                <tbody>
                  {result.data.recentAudit.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td className="row-leader">{event.action}</td>
                      <td>{event.targetType}</td>
                      <td><StatusPill status={event.outcome} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
