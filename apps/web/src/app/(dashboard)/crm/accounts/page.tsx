import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
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

export default async function AccountsListPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>
}) {
  const profile = await requireUserProfile()
  const rawPage = (await searchParams)?.page
  const requestedPage = Number.parseInt(Array.isArray(rawPage) ? rawPage[0] ?? '' : rawPage ?? '', 10)
  const canCreateAccount = can(profile.role, 'account.create')
  const canStartPprf = can(profile.role, 'pprf.submit')

  const { rows, total, page, totalPages } = await getAccountsFiltered(profile.tenantId, {
    sort: 'created_at',
    order: 'desc',
    page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canStartPprf && (
              <Link href="/crm/opportunities/new/pprf" className="user-chip" style={{ borderColor: 'var(--color-navy-700)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-navy-text)' }}>+ New PPRF intake</span>
              </Link>
            )}
            {canCreateAccount && (
              <Link href="/crm/accounts/new" className="user-chip" style={{ borderColor: 'var(--color-border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-neutral-700)' }}>+ New account</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{total} account{total === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">
            {total > 0 ? 'No accounts on this page.' : 'No accounts yet. Create your first to start the pipeline.'}
          </div>
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
                    {new Date(r.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila',
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
        {totalPages > 1 && (
          <nav aria-label="Account pages" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 16px' }}>
            <span className="muted">Page {page} of {totalPages}</span>
            {page > 1 && <Link href={`/crm/accounts?page=${page - 1}`} className="user-chip">Previous</Link>}
            {page < totalPages && <Link href={`/crm/accounts?page=${page + 1}`} className="user-chip">Next</Link>}
          </nav>
        )}
      </div>
    </div>
  )
}
