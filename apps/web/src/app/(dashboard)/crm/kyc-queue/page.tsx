import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, desc, ne, sql } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  accountKycArtifacts,
  opportunityKycTracks,
  opportunities,
} from '@third-code-erp/database/schema'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'KYC Queue' }

export default async function KycQueuePage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'account.kyc_review')) {
    redirect('/crm/accounts?error=forbidden')
  }

  const [rows, trackRows] = await Promise.all([
    db
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
    .limit(200),
    db
      .select({
        id: opportunityKycTracks.id,
        opportunity_id: opportunityKycTracks.opportunity_id,
        track_type: opportunityKycTracks.track_type,
        status: opportunityKycTracks.status,
        due_at: opportunityKycTracks.due_at,
        account_name: accounts.name,
      })
      .from(opportunityKycTracks)
      .innerJoin(
        opportunities,
        and(
          eq(opportunities.id, opportunityKycTracks.opportunity_id),
          eq(opportunities.tenant_id, profile.tenantId)
        )
      )
      .leftJoin(
        accounts,
        and(
          eq(accounts.id, opportunities.account_id),
          eq(accounts.tenant_id, profile.tenantId)
        )
      )
      .where(
        and(
          eq(opportunityKycTracks.tenant_id, profile.tenantId),
          ne(opportunityKycTracks.status, 'approved')
        )
      )
      .orderBy(opportunityKycTracks.due_at)
      .limit(200),
  ])

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

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <h2 className="card-title">
            PPRF dual-track reviews ({trackRows.length})
          </h2>
        </div>
        {trackRows.length === 0 ? (
          <div className="card-empty">No Financial Evaluation or Credit Investigation tracks waiting.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client / opportunity</th>
                <th>Track</th>
                <th>Status</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trackRows.map((track) => {
                const overdue = track.due_at.getTime() < Date.now()
                return (
                  <tr key={track.id}>
                    <td><strong style={{ fontWeight: 500 }}>{track.account_name ?? 'Unassigned client'}</strong></td>
                    <td className="muted">{track.track_type.replace(/_/g, ' ')}</td>
                    <td><span className="stage-badge"><span className="stage-badge-dot" />{track.status.replace(/_/g, ' ')}</span></td>
                    <td className={overdue ? '' : 'muted'} style={overdue ? { color: 'var(--color-danger)', fontWeight: 600 } : undefined}>
                      {track.due_at.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}{overdue ? ' · overdue' : ''}
                    </td>
                    <td><Link href={`/crm/opportunities/${track.opportunity_id}/proposal/pprf`} style={{ color: 'var(--color-navy-700)', fontSize: 12.5, fontWeight: 500 }}>Open →</Link></td>
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
