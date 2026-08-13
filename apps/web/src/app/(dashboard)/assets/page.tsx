import type { Metadata } from 'next'
import Link from 'next/link'
import {
  assetKindValues,
  assetListQuerySchema,
  type AssetListQuery,
  type AssetListResult,
  type AssetMaintenanceDueResult,
} from '@third-code-erp/shared-types'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import {
  assetReadsUseCoreApi,
  getAssetMaintenanceDueThroughCoreApi,
  getAssetsThroughCoreApi,
} from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Asset register' }

type AssetSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseQuery(searchParams: AssetSearchParams):
  | { ok: true; data: AssetListQuery }
  | { ok: false } {
  const parsed = assetListQuerySchema.safeParse({
    q: first(searchParams.q),
    kind: first(searchParams.kind),
    status: first(searchParams.status),
    sort: first(searchParams.sort),
    order: first(searchParams.order),
    page: first(searchParams.page),
    limit: first(searchParams.limit),
  })
  if (!parsed.success) return { ok: false }
  return { ok: true, data: parsed.data }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function statusClass(status: AssetListResult['rows'][number]['status']): string {
  if (status === 'active') return 'finance-status-open'
  if (status === 'retired') return 'finance-status-closed'
  return 'finance-status-maintenance'
}

function AssetState({
  title,
  body,
  link,
}: {
  title: string
  body: string
  link?: React.ReactNode
}) {
  return (
    <section className="finance-section" aria-live="polite">
      <div className="card-empty">
        <p><strong>{title}</strong></p>
        <p>{body}</p>
        {link}
      </div>
    </section>
  )
}

function AssetFilters({ query }: { query: AssetListQuery }) {
  return (
    <form className="ledger-filters" method="get">
      <div className="finance-field finance-field-grow">
        <label htmlFor="asset-search">Search register</label>
        <input
          id="asset-search"
          name="q"
          defaultValue={query.q ?? ''}
          placeholder="Tag, name, serial, manufacturer"
          maxLength={255}
        />
      </div>
      <div className="finance-field">
        <label htmlFor="asset-kind">Kind</label>
        <select id="asset-kind" name="kind" defaultValue={query.kind ?? ''}>
          <option value="">All kinds</option>
          {assetKindValues.map((kind) => (
            <option key={kind} value={kind}>
              {kind[0]!.toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="finance-field">
        <label htmlFor="asset-status">Status</label>
        <select id="asset-status" name="status" defaultValue={query.status ?? ''}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </div>
      <button type="submit" className="finance-primary-link">
        Filter
      </button>
    </form>
  )
}

function dueStateClass(state: AssetMaintenanceDueResult['rows'][number]['dueState']): string {
  return state === 'overdue' ? 'finance-status-closed' : 'finance-status-maintenance'
}

function MaintenanceDuePanel({
  due,
  error,
}: {
  due: AssetMaintenanceDueResult | null
  error: string | null
}) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Service watch</p>
          <h2>Due or overdue maintenance</h2>
        </div>
        <p>Latest service record per active asset, bounded to the next 30 days.</p>
      </div>
      <div className="finance-table-shell">
        {error ? (
          <div className="card-empty" aria-live="polite">
            <p><strong>Maintenance watch unavailable</strong></p>
            <p>{error}</p>
          </div>
        ) : !due || due.rows.length === 0 ? (
          <div className="card-empty" aria-live="polite">
            <p><strong>No service dates need attention.</strong></p>
            <p>Assets with a next due date in the current watch window will appear here.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Next due</th>
                <th>State</th>
                <th>Latest service</th>
                <th>Project / location</th>
              </tr>
            </thead>
            <tbody>
              {due.rows.map((row) => (
                <tr key={row.assetId}>
                  <td>
                    <Link href={`/assets/${row.assetId}`}>
                      <strong>{row.assetTag}</strong>
                    </Link>
                    <span className="finance-cell-detail">{row.assetName}</span>
                  </td>
                  <td>{formatDate(row.nextDueOn)}</td>
                  <td>
                    <span className={`finance-status ${dueStateClass(row.dueState)}`}>
                      {row.dueState === 'overdue' ? 'Overdue' : `${row.daysUntilDue} days`}
                    </span>
                  </td>
                  <td>
                    <strong>{row.summary}</strong>
                    <span className="finance-cell-detail">{row.maintenanceType}</span>
                  </td>
                  <td>
                    <strong>{row.assignedProjectName ?? 'Unassigned'}</strong>
                    <span className="finance-cell-detail">{row.location ?? 'No location'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function AssetRegister({
  data,
  query,
  due,
  dueError,
}: {
  data: AssetListResult
  query: AssetListQuery
  due: AssetMaintenanceDueResult | null
  dueError: string | null
}) {
  const activeCount = data.rows.filter((row) => row.status === 'active').length
  const maintenanceCount = data.rows.filter((row) => row.status === 'maintenance').length
  const assignedCount = data.rows.filter((row) => row.assignedProjectId).length

  return (
    <>
      <AssetFilters query={query} />
      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Records in view</p>
          <p className="kpi-card-value">{data.total}</p>
          <p className="kpi-card-sub">Tenant-scoped register rows</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Active</p>
          <p className="kpi-card-value">{activeCount}</p>
          <p className="kpi-card-sub">Available for custody</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Maintenance</p>
          <p className="kpi-card-value">{maintenanceCount}</p>
          <p className="kpi-card-sub">Needs service review</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Assigned</p>
          <p className="kpi-card-value">{assignedCount}</p>
          <p className="kpi-card-sub">Linked to a project</p>
        </div>
      </div>

      <MaintenanceDuePanel due={due} error={dueError} />

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Custody and continuity</p>
            <h2>Equipment, vehicles, tools, and fixtures</h2>
          </div>
          <p>Read-only source-backed register. Maintenance and accounting commands stay separate.</p>
        </div>
        <div className="finance-table-shell">
          {data.rows.length === 0 ? (
            <div className="card-empty">
              <p>No asset records match current filters.</p>
              <Link href="/assets">Clear filters</Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Project / location</th>
                  <th>Serial / model</th>
                  <th>Commissioned</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/assets/${row.id}`}>
                        <strong>{row.assetTag}</strong>
                      </Link>
                      <span className="finance-cell-detail">{row.name}</span>
                    </td>
                    <td>{row.kind}</td>
                    <td>
                      <span className={`finance-status ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <strong>{row.assignedProjectName ?? 'Unassigned'}</strong>
                      <span className="finance-cell-detail">{row.location ?? 'No location'}</span>
                    </td>
                    <td>
                      <strong>{row.serialNumber ?? 'No serial'}</strong>
                      <span className="finance-cell-detail">
                        {[row.manufacturer, row.model].filter(Boolean).join(' · ') || 'No model detail'}
                      </span>
                    </td>
                    <td>{formatDate(row.commissionedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="finance-record-list" aria-label="Asset register pagination">
          <div className="finance-record">
            <div>
              <strong>Page {data.page} of {data.totalPages}</strong>
              <span>{data.total} total records · maximum {data.limit} per request</span>
            </div>
            <div className="finance-header-actions">
              {data.page > 1 && (
                  <Link className="finance-secondary-link" href={{ pathname: '/assets', query: { ...query, page: String(data.page - 1) } }}>
                  Previous
                </Link>
              )}
              {data.page < data.totalPages && (
                <Link className="finance-secondary-link" href={{ pathname: '/assets', query: { ...query, page: String(data.page + 1) } }}>
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<AssetSearchParams>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'asset.read')
  const params = await searchParams
  const parsed = parseQuery(params)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/inventory">Operations</Link> · Custody
          </p>
          <h1 className="page-title">Asset register</h1>
          <p className="page-subtitle">
            Keep equipment identity, project custody, and service context searchable in one tenant-safe view.
          </p>
        </div>
        <div className="finance-header-actions">
          <span className="finance-status finance-status-open">Read only</span>
          <Link href="/inventory" className="finance-secondary-link">Inventory</Link>
        </div>
      </div>

      {!parsed.ok ? (
        <AssetState
          title="Filters need review"
          body="Use supported asset filters and try again. No database query was issued."
          link={<Link href="/assets">Reset filters</Link>}
        />
      ) : !assetReadsUseCoreApi(profile.tenantId) ? (
        <AssetState
          title="Asset register staged for controlled rollout"
          body="Core asset reads remain disabled until hosted schema parity, RLS/audit review, and a protected tenant canary are complete."
          link={<Link href="/inventory">Open inventory controls</Link>}
        />
      ) : (
        <AssetData query={parsed.data} />
      )}
    </div>
  )
}

async function AssetData({ query }: { query: AssetListQuery }) {
  const [result, dueResult] = await Promise.all([
    getAssetsThroughCoreApi(query),
    getAssetMaintenanceDueThroughCoreApi({ daysAhead: 30, page: 1, limit: 50 }),
  ])
  if (!result.ok || !result.data) {
    return (
      <AssetState
        title="Asset register unavailable"
        body={result.error ?? 'Core returned no asset data. No direct database fallback was used.'}
        link={<Link href="/assets">Retry</Link>}
      />
    )
  }
  return (
    <AssetRegister
      data={result.data}
      query={query}
      due={dueResult.ok && dueResult.data ? dueResult.data : null}
      dueError={dueResult.ok ? null : dueResult.error ?? 'Core returned no due data.'}
    />
  )
}
