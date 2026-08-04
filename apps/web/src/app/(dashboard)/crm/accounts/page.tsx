import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import type { Metadata } from 'next'
import { getAccountsFiltered } from '@/lib/account-queries'

export const metadata: Metadata = { title: 'Accounts' }

const KYC_BADGE: Record<string, string> = {
  pending: 'stage-badge stage-resubmission',
  approved: 'stage-badge stage-closed_won',
  flagged: 'stage-badge stage-negotiation',
  rejected: 'stage-badge stage-closed_lost',
  not_required: 'stage-badge stage-opportunity_creation',
}

export default async function AccountsListPage() {
  const profile = await requireUserProfile()

  const { rows } = await getAccountsFiltered(profile.tenantId, {
    sort: 'created_at',
    order: 'desc',
    limit: 100,
  })

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">CRM</p>
            <h1 className="page-title">Accounts</h1>
            <p className="page-subtitle">
              Client companies with KYC review status and linked opportunities.
            </p>
          </div>
          <Link href="/crm/accounts/new" className="user-chip" style={{ borderColor: 'var(--color-navy-700)' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-navy-700)' }}>+ New account</span>
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{rows.length} account{rows.length === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">No accounts yet. Create your first to start the pipeline.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>KYC</th>
                <th>Opportunities</th>
                <th>Primary contact</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/crm/accounts/${r.id}`} className="row-leader" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="avatar-pill">{r.name.slice(0, 2).toUpperCase()}</div>
                      <strong style={{ fontWeight: 500 }}>{r.name}</strong>
                    </Link>
                  </td>
                  <td className="muted">{r.industry.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={KYC_BADGE[r.kyc_status] ?? 'stage-badge'}>
                      <span className="stage-badge-dot" />
                      {r.kyc_status}
                    </span>
                  </td>
                  <td className="numeric">{r.opp_count}</td>
                  <td className="muted">
                    {r.primary_email || r.primary_phone || '—'}
                  </td>
                  <td className="muted">
                    {new Date(r.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
