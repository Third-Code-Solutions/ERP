import { getPlatformAudit } from '@/lib/platform-admin-client'
import { EmptyPlatformState, PlatformDirectoryFilters, PlatformPagination, PlatformPageHeader, PlatformUnavailable, StatusPill } from '../_components'

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams
  const result = await getPlatformAudit(params.q, params.status, params.page)
  return <>
    <PlatformPageHeader title="Platform audit" description="Append-only evidence for privileged platform actions. Actor and target identifiers are retained for incident response." />
    <PlatformDirectoryFilters path="/platform-admin/audit" q={params.q} status={params.status} statuses={['succeeded', 'denied', 'failed']} />
    {!result.ok ? <PlatformUnavailable message={result.error} /> : <section className="card">{result.data.rows.length === 0 ? <EmptyPlatformState>No privileged events have been recorded.</EmptyPlatformState> : <div className="platform-table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Action</th><th>Outcome</th><th>Target</th><th>Tenant</th><th>Trace</th></tr></thead><tbody>{result.data.rows.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td className="row-leader">{event.action}</td><td><StatusPill status={event.outcome} /></td><td>{event.targetType}{event.targetId ? <small>{event.targetId}</small> : null}</td><td>{event.targetTenantId || 'Global'}</td><td><code>{event.traceId}</code></td></tr>)}</tbody></table></div>}</section>}
    {result.ok ? <PlatformPagination path="/platform-admin/audit" page={result.data.page} totalPages={result.data.totalPages} params={params} /> : null}
  </>
}
