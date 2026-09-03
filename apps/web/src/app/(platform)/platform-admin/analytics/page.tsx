import { getPlatformAnalytics, getPlatformOperationalAnalytics } from '@/lib/platform-admin-client'
import { MetricCard, PlatformPageHeader, PlatformUnavailable } from '../_components'

export default async function PlatformAnalyticsPage() {
  const [result, operations] = await Promise.all([
    getPlatformAnalytics(), getPlatformOperationalAnalytics(),
  ])
  return <>
    <PlatformPageHeader title="Analytics" description="Cross-tenant snapshots from persisted ERP records. Counts refresh on page load; they are not live provider telemetry." />
    <div className="platform-stack">
      {!result.ok ? <PlatformUnavailable message={result.error} /> :
        <section className="platform-metric-grid" aria-label="Platform population">
          <MetricCard label="Tenants" value={result.data.tenants.total} detail={`${result.data.tenants.active} active · ${result.data.tenants.suspended} suspended · ${result.data.tenants.disabled} disabled`} />
          <MetricCard label="Users" value={result.data.users.total} detail={`${result.data.users.active} active · ${result.data.users.invited} invited · ${result.data.users.suspended} suspended · ${result.data.users.disabled} disabled`} />
          <MetricCard label="Projects" value={result.data.projects.total} detail={`${result.data.projects.active} active and not retired`} />
          <MetricCard label="Opportunities" value={result.data.opportunities.total} detail={`${result.data.opportunities.open} open; closed-won/lost excluded`} />
        </section>}
      {!operations.ok ? <PlatformUnavailable title="Operational counts unavailable" message={operations.error} /> : <>
        <section className="platform-metric-grid" aria-label="Persisted operational counts">
          <MetricCard label="Documents" value={operations.data.documents.total} detail="Persisted document records across tenants" />
          <MetricCard label="Recorded document bytes" value={BigInt(operations.data.documents.bytes).toLocaleString('en-PH')} detail="Sum of document metadata; not an object-store reconciliation" />
          <MetricCard label="KYC tracks awaiting review" value={operations.data.kyc.pendingTracks} detail="Pending or in-review opportunity tracks, not unique accounts" />
          <MetricCard label="Overdue KYC tracks" value={operations.data.kyc.overdueTracks} detail="Awaiting review with due_at before the database clock" />
          <MetricCard label="Flagged KYC tracks" value={operations.data.kyc.flaggedTracks} detail="Tracks currently flagged; separate from pending reviews" />
          <MetricCard label="Failed document jobs" value={operations.data.jobs.documentFailed} detail="Document processing jobs currently in failed state" />
          <MetricCard label="Failed generation jobs" value={operations.data.jobs.generationFailed} detail="Cortex assistant generation jobs currently failed" />
          <MetricCard label="Failed indexing jobs" value={operations.data.jobs.indexFailed} detail="Cortex semantic index jobs currently failed" />
          <MetricCard label="Recorded privileged failures" value={operations.data.privileged.failed} detail="All-time failed platform audit events; not all server errors" />
          <MetricCard label="Recorded privileged denials" value={operations.data.privileged.denied} detail="All-time denied platform audit events; excludes unrecorded guard denials" />
        </section>
        <p>Operational snapshot generated at <time dateTime={operations.data.generatedAt}>{operations.data.generatedAt}</time> (UTC). Job counts are current terminal states, not failure rates or queue health.</p>
      </>}
      <section className="card platform-unavailable">
        <p className="page-eyebrow">Instrumentation boundary</p>
        <h2>Additional telemetry is not connected</h2>
        <p>Adoption trends, normalized cross-tenant revenue, a unified approval inbox, all server-action errors and live worker/queue health are not instrumented in this console. Missing metrics are not reported as zero.</p>
      </section>
    </div>
  </>
}
