import { PlatformSubmitButton } from '../_submit-button'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'

import { getPlatformTenants } from '@/lib/platform-admin-client'
import {
  changeTenantStatusAction,
  createTenantAction,
  startSupportContextAction,
  updateTenantAction,
} from '../actions'
import {
  EmptyPlatformState,
  PlatformDirectoryFilters,
  PlatformPagination,
  PlatformFlash,
  PlatformPageHeader,
  PlatformUnavailable,
  StatusPill,
} from '../_components'

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; notice?: string; error?: string }>
}) {
  const params = await searchParams
  const result = await getPlatformTenants(params.q, params.status, params.page)
  return (
    <>
      <PlatformPageHeader title="Tenants" description="Create, configure, suspend, reactivate, and enter an audited support context for customer organizations." />
      <PlatformFlash notice={params.notice} error={params.error} />
      {!result.ok ? <PlatformUnavailable message={result.error} /> : (
        <div className="platform-stack">
          <section className="card platform-form-card">
            <div className="card-header"><div><h2 className="card-title">Create tenant</h2><p className="card-subtitle">A tenant starts active with no users until an invitation is sent.</p></div></div>
            <form action={createTenantAction} className="platform-form-grid">
              <label>Name<input required name="name" minLength={2} maxLength={255} /></label>
              <label>Slug<input required name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="customer-name" /></label>
              <label>Organization type<select name="organizationType" defaultValue="construction">{ORGANIZATION_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>
              <label>DPO email<input name="dpoContact" type="email" /></label>
              <label>PCAB license<input name="pcabLicense" maxLength={50} /></label>
              <label>BIR TIN<input name="birTin" maxLength={20} /></label>
              <div className="platform-form-actions"><PlatformSubmitButton className="button button-primary" confirmation="Create this tenant with the entered configuration?">Create tenant</PlatformSubmitButton></div>
            </form>
          </section>

          <section className="card">
            <div className="card-header"><div><h2 className="card-title">Tenant directory</h2><p className="card-subtitle">{result.data.total} organizations · source-backed counts</p></div></div>
            {result.data.rows.length === 0 ? <EmptyPlatformState>No tenants match this view.</EmptyPlatformState> : (
              <div className="platform-table-wrap"><table className="data-table"><thead><tr><th>Tenant</th><th>Lifecycle</th><th>Users</th><th>Projects</th><th>Last activity</th><th>Support</th><th>Change status</th></tr></thead><tbody>
                {result.data.rows.map((tenant) => <tr key={tenant.id}>
                  <td><strong>{tenant.name}</strong><small>{tenant.slug} · {tenant.organizationType}</small><details><summary>Configure</summary><form action={updateTenantAction} className="platform-inline-form"><input type="hidden" name="tenantId" value={tenant.id} /><input required name="name" defaultValue={tenant.name} minLength={2} maxLength={255} aria-label={`Name for ${tenant.name}`} /><select name="organizationType" defaultValue={tenant.organizationType} aria-label={`Organization type for ${tenant.name}`}>{ORGANIZATION_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select><PlatformSubmitButton className="button button-secondary" confirmation="Save this tenant configuration?">Save configuration</PlatformSubmitButton></form></details></td>
                  <td><StatusPill status={tenant.status} />{tenant.statusReason ? <small>{tenant.statusReason}</small> : null}</td>
                  <td>{tenant.activeUserCount} active / {tenant.userCount}</td>
                  <td>{tenant.projectCount}</td>
                  <td>{tenant.lastActivityAt ? new Date(tenant.lastActivityAt).toLocaleString() : 'No recorded activity'}</td>
                  <td>
                    <form action={startSupportContextAction} className="platform-inline-form">
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input name="reason" required minLength={3} maxLength={500} aria-label={`Support reason for ${tenant.name}`} placeholder="Reason" />
                      <select name="durationMinutes" defaultValue="30" aria-label="Duration"><option value="30">30 min</option><option value="60">1 hour</option><option value="240">4 hours</option></select>
                      <PlatformSubmitButton className="button button-secondary">Enter</PlatformSubmitButton>
                    </form>
                  </td>
                  <td><form action={changeTenantStatusAction} className="platform-inline-form">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <select name="status" defaultValue={tenant.status} aria-label={`Lifecycle for ${tenant.name}`}><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select>
                    <input name="reason" maxLength={500} aria-label={`Status reason for ${tenant.name}`} placeholder="Reason if inactive" />
                    <PlatformSubmitButton className="button button-secondary" confirmation="Apply this lifecycle change? Suspended or disabled access takes effect immediately.">Apply</PlatformSubmitButton>
                  </form></td>
                </tr>)}
              </tbody></table></div>
            )}
            <PlatformDirectoryFilters path="/platform-admin/tenants" q={params.q} status={params.status} statuses={['active', 'suspended', 'disabled']} />
            <PlatformPagination path="/platform-admin/tenants" page={result.data.page} totalPages={result.data.totalPages} params={params} />
          </section>
        </div>
      )}
    </>
  )
}
