import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, desc, sql } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { accounts, accountKycArtifacts } from '@buildops/database/schema'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'KYC Queue' }

export default async function KycQueuePage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'account.kyc_review')) {
    redirect('/crm/accounts?error=forbidden')
  }

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      industry: accounts.industry,
      created_at: accounts.created_at,
      artifact_count: sql<number>`COUNT(${accountKycArtifacts.id})::int`,
    })
    .from(accounts)
    .leftJoin(accountKycArtifacts, eq(accountKycArtifacts.account_id, accounts.id))
    .where(and(eq(accounts.tenant_id, profile.tenantId), eq(accounts.kyc_status, 'pending')))
    .groupBy(accounts.id)
    .orderBy(accounts.created_at)
    .limit(200)

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM · Finance</p>
        <h1 className="page-title">KYC review queue</h1>
        <p className="page-subtitle">
          Accounts awaiting financial evaluation. Approve unblocks the sales pipeline;
          flag or reject locks downstream stages until resolved.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {rows.length} pending review{rows.length === 1 ? '' : 's'}
          </h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">No accounts pending KYC review.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Industry</th>
                <th className="numeric">Artifacts</th>
                <th>Days waiting</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/crm/accounts/${r.id}`} className="row-leader" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="avatar-pill">{r.name.slice(0, 2).toUpperCase()}</div>
                        <strong style={{ fontWeight: 500 }}>{r.name}</strong>
                      </Link>
                    </td>
                    <td className="muted">{r.industry.replace(/_/g, ' ')}</td>
                    <td className="numeric">{r.artifact_count}</td>
                    <td className={days > 3 ? '' : 'muted'} style={days > 3 ? { color: 'var(--color-warning)', fontWeight: 500 } : {}}>
                      {days}d
                    </td>
                    <td>
                      <Link href={`/crm/accounts/${r.id}`} style={{ color: 'var(--color-navy-700)', fontSize: 12.5, fontWeight: 500 }}>
                        Review →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
