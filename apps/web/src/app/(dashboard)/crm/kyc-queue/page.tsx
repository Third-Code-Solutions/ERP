import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  opportunities,
  opportunityKycTracks,
} from '@third-code-erp/database/schema'
import {
  opportunityKycTrackLabel,
  opportunityKycTrackStatusLabel,
} from '@third-code-erp/shared-types'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getKycQueue } from '@/lib/account-queries'
import type { Metadata } from 'next'
import styles from '../../workspace-qa.module.css'

export const metadata: Metadata = { title: 'KYC Queue' }

async function getPendingOpportunityReviews(tenantId: string) {
  return db
    .select({
      id: opportunityKycTracks.id,
      opportunity_id: opportunities.id,
      account_name: accounts.name,
      track_type: opportunityKycTracks.track_type,
      status: opportunityKycTracks.status,
      due_at: opportunityKycTracks.due_at,
    })
    .from(opportunityKycTracks)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.id, opportunityKycTracks.opportunity_id),
        eq(opportunities.tenant_id, tenantId)
      )
    )
    .leftJoin(
      accounts,
      and(
        eq(accounts.id, opportunities.account_id),
        eq(accounts.tenant_id, tenantId)
      )
    )
    .where(
      and(
        eq(opportunityKycTracks.tenant_id, tenantId),
        inArray(opportunityKycTracks.status, ['pending', 'in_review'])
      )
    )
    .orderBy(asc(opportunityKycTracks.due_at), asc(opportunityKycTracks.id))
    .limit(400)
}

export default async function KycQueuePage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'account.kyc.read')) {
    redirect('/crm/accounts?error=forbidden')
  }
  const canReview = can(profile.role, 'account.kyc_review')

  const [accountResult, opportunityResult] = await Promise.allSettled([
    getKycQueue(profile.tenantId),
    getPendingOpportunityReviews(profile.tenantId),
  ])
  const rows = accountResult.status === 'fulfilled' ? accountResult.value : []
  const opportunityReviews =
    opportunityResult.status === 'fulfilled' ? opportunityResult.value : []

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM · Finance</p>
        <h1 className="page-title">KYC review queue</h1>
        <p className="page-subtitle">
          Review account documents and pending opportunity financial and credit checks.
        </p>
        <p><Link href="/crm/accounts">Browse accounts</Link> · <Link href="/pipeline">Browse opportunities</Link></p>
        <p className="muted">Opportunity reviews appear after the first PPRF is submitted. Open a review to inspect its evidence and record a decision.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {accountResult.status === 'rejected' ? 'Account reviews unavailable' : `${rows.length} pending review${rows.length === 1 ? '' : 's'}`}
          </h2>
        </div>
        {accountResult.status === 'rejected' ? (
          <div className="card-empty" role="alert">
            Account KYC reviews could not be loaded. Refresh the page to try again.
          </div>
        ) : rows.length === 0 ? (
          <div className="card-empty">No accounts pending KYC review.</div>
        ) : (
          <div className={styles.table}><table className="data-table">
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
                        {canReview ? 'Review →' : 'View →'}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2 className="card-title">
            {opportunityResult.status === 'rejected' ? 'Opportunity reviews unavailable' : `${opportunityReviews.length} pending opportunity review${opportunityReviews.length === 1 ? '' : 's'}`}
          </h2>
        </div>
        {opportunityResult.status === 'rejected' ? (
          <div className="card-empty" role="alert">
            Opportunity financial and credit reviews could not be loaded. Refresh the page to try again.
          </div>
        ) : opportunityReviews.length === 0 ? (
          <div className="card-empty">No opportunity financial or credit reviews are pending.</div>
        ) : (
          <div className={styles.table}><table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Review</th>
                <th>Status</th>
                <th>Due</th>
                <th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {opportunityReviews.map((review) => {
                const href = `/crm/opportunities/${review.opportunity_id}/proposal/pprf`
                const accountName = review.account_name ?? 'Opportunity'
                const trackLabel = opportunityKycTrackLabel(review.track_type)
                const overdue = review.due_at.getTime() < Date.now()

                return (
                  <tr key={review.id}>
                    <td>
                      <Link href={href} className="row-leader" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="avatar-pill">{accountName.slice(0, 2).toUpperCase()}</div>
                        <span>
                          <strong style={{ display: 'block', fontWeight: 500 }}>{accountName}</strong>
                          <span className="muted" style={{ fontSize: 12 }}>
                            Opportunity {review.opportunity_id.slice(0, 8)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>{trackLabel}</td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>
                      {opportunityKycTrackStatusLabel(review.status)}
                    </td>
                    <td
                      className={overdue ? '' : 'muted'}
                      style={overdue ? { color: 'var(--color-warning)', fontWeight: 500 } : {}}
                    >
                      {review.due_at.toLocaleDateString('en-PH', {
                        timeZone: 'Asia/Manila',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {overdue ? ' · overdue' : ''}
                    </td>
                    <td>
                      <Link
                        href={href}
                        aria-label={`${canReview ? 'Review' : 'View'} ${trackLabel} for ${accountName}`}
                        style={{ color: 'var(--color-navy-700)', fontSize: 12.5, fontWeight: 500 }}
                      >
                        {canReview ? 'Review →' : 'View →'}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
