import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import {
  assetMaintenanceListQuerySchema,
  assetMaintenanceTypeValues,
  type AssetMaintenanceListResult,
  type AssetReadResult,
} from '@third-code-erp/shared-types'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import {
  assetMaintenanceCreateWritesUseCoreApi,
  assetMaintenanceReadsUseCoreApi,
  assetReadsUseCoreApi,
  getAssetMaintenanceThroughCoreApi,
  getAssetThroughCoreApi,
} from '@/lib/erp-core-client'
import { createAssetMaintenance } from './actions'

export const metadata: Metadata = { title: 'Asset detail' }

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function AssetState({ title, body }: { title: string; body: string }) {
  return (
    <section className="finance-section" aria-live="polite">
      <div className="card-empty">
        <p><strong>{title}</strong></p>
        <p>{body}</p>
        <Link href="/assets">Back to asset register</Link>
      </div>
    </section>
  )
}

function AssetIdentity({ asset }: { asset: AssetReadResult }) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Asset identity</p>
          <h2>{asset.assetTag} · {asset.name}</h2>
        </div>
        <span className="finance-status finance-status-open">{asset.status}</span>
      </div>
      <div className="finance-record-list">
        <div className="finance-record">
          <div><strong>Kind</strong><span>{asset.kind}</span></div>
          <div><strong>Serial / model</strong><span>{[asset.serialNumber, asset.model].filter(Boolean).join(' · ') || '—'}</span></div>
          <div><strong>Custody</strong><span>{asset.assignedProjectName ?? 'Unassigned'} · {asset.location ?? 'No location'}</span></div>
          <div><strong>Commissioned</strong><span>{formatDate(asset.commissionedOn)}</span></div>
        </div>
      </div>
    </section>
  )
}

function MaintenanceHistory({ data }: { data: AssetMaintenanceListResult }) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Service continuity</p>
          <h2>Maintenance history</h2>
        </div>
        <p>{data.total} recorded service event{data.total === 1 ? '' : 's'}</p>
      </div>
      <div className="finance-table-shell">
        {data.rows.length === 0 ? (
          <div className="card-empty"><p>No maintenance history recorded yet.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Service</th><th>Performed</th><th>Next due</th><th>Vendor</th><th>Cost</th></tr></thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.summary}</strong><span className="finance-cell-detail">{row.maintenanceType}</span></td>
                  <td>{formatDate(row.performedOn)}</td>
                  <td>{formatDate(row.nextDueOn)}</td>
                  <td>{row.vendorName ?? '—'}</td>
                  <td>{formatMoney(row.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function MaintenanceForm({ assetId }: { assetId: string }) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div><p className="finance-eyebrow">Controlled command</p><h2>Record a service event</h2></div>
        <p>Creates an audited, idempotent record through ERP Core.</p>
      </div>
      <form action={createAssetMaintenance.bind(null, assetId)} className="ledger-filters">
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <div className="finance-field">
          <label htmlFor="maintenance-type">Type</label>
          <select id="maintenance-type" name="maintenanceType" defaultValue="inspection" required>
            {assetMaintenanceTypeValues.map((type) => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}
          </select>
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="maintenance-summary">Summary</label>
          <input id="maintenance-summary" name="summary" maxLength={200} required placeholder="What was inspected or repaired?" />
        </div>
        <div className="finance-field">
          <label htmlFor="maintenance-performed">Performed</label>
          <input id="maintenance-performed" type="date" name="performedOn" required />
        </div>
        <div className="finance-field">
          <label htmlFor="maintenance-next-due">Next due</label>
          <input id="maintenance-next-due" type="date" name="nextDueOn" />
        </div>
        <div className="finance-field">
          <label htmlFor="maintenance-vendor">Vendor</label>
          <input id="maintenance-vendor" name="vendorName" maxLength={160} />
        </div>
        <div className="finance-field">
          <label htmlFor="maintenance-cost">Cost (centavos)</label>
          <input id="maintenance-cost" type="number" name="costCents" min="0" max="100000000000" step="1" defaultValue="0" />
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="maintenance-notes">Notes</label>
          <textarea id="maintenance-notes" name="notes" maxLength={2000} rows={3} />
        </div>
        <button type="submit" className="finance-primary-link">Save service event</button>
      </form>
    </section>
  )
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'asset.read')
  const { assetId } = await requireUuidRouteParams(params)

  if (!assetReadsUseCoreApi(profile.tenantId)) {
    return <AssetState title="Asset detail staged" body="Core asset reads remain disabled until the protected tenant canary is approved." />
  }

  const assetResult = await getAssetThroughCoreApi(assetId)
  if (!assetResult.ok || !assetResult.data) {
    return <AssetState title="Asset detail unavailable" body={assetResult.error ?? 'Core returned no asset detail.'} />
  }

  const historyEnabled = assetMaintenanceReadsUseCoreApi(profile.tenantId)
  const historyResult = historyEnabled
    ? await getAssetMaintenanceThroughCoreApi(
        assetId,
        assetMaintenanceListQuerySchema.parse({ page: 1, limit: 50 })
      )
    : null

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow"><Link href="/assets">Operations</Link> · Asset detail</p>
          <h1 className="page-title">{assetResult.data.assetTag}</h1>
          <p className="page-subtitle">Identity, custody, and service evidence for one tenant-scoped operational asset.</p>
        </div>
        <div className="finance-header-actions"><Link href="/assets" className="finance-secondary-link">Asset register</Link></div>
      </div>
      <AssetIdentity asset={assetResult.data} />
      {!historyEnabled ? (
        <AssetState title="Maintenance history staged" body="Service history remains closed until the migration replay, audit/RLS review, and protected tenant canary are complete." />
      ) : !historyResult?.ok || !historyResult.data ? (
        <AssetState title="Maintenance history unavailable" body={historyResult?.error ?? 'Core returned no maintenance history.'} />
      ) : (
        <>
          <MaintenanceHistory data={historyResult.data} />
          {assetMaintenanceCreateWritesUseCoreApi(profile.tenantId) && can(profile.role, 'asset.maintenance.manage') && assetResult.data.status !== 'retired' ? <MaintenanceForm assetId={assetId} /> : null}
        </>
      )}
    </div>
  )
}
