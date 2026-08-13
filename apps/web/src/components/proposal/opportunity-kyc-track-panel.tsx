'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  opportunityKycTrackLabel,
  opportunityKycTrackStatusLabel,
  type OpportunityKycTrackType,
} from '@third-code-erp/shared-types'
import { updateOpportunityKycTrack } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/kyc-actions'

type TrackType = OpportunityKycTrackType

export interface OpportunityKycTrackView {
  id: string
  track_type: TrackType
  status: 'pending' | 'in_review' | 'approved' | 'flagged' | 'rejected'
  due_at: string
  prepared_at: string | null
  fc_recommended_at: string | null
  president_decided_at: string | null
  decision_reason: string | null
  notes: string | null
}

interface OpportunityKycTrackPanelProps {
  opportunityId: string
  tracks: OpportunityKycTrackView[]
  canManage: boolean
  canApprove: boolean
}

export function OpportunityKycTrackPanel({
  opportunityId,
  tracks,
  canManage,
  canApprove,
}: OpportunityKycTrackPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function submit(formData: FormData) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await updateOpportunityKycTrack(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess('Review track updated.')
      router.refresh()
    })
  }

  return (
    <section className="card" aria-labelledby="kyc-track-heading">
      <div className="card-header">
        <div>
          <p className="page-eyebrow">WO-11 · Dual-track gate</p>
          <h2 className="card-title" id="kyc-track-heading">Finance review</h2>
        </div>
        <span className="track-count">{tracks.filter((track) => track.status === 'approved').length}/{tracks.length} clear</span>
      </div>
      {tracks.length === 0 ? (
        <div className="card-empty">Submit a PPRF to open Financial Evaluation and Credit Investigation.</div>
      ) : (
        <div className="track-list">
          {tracks.map((track) => (
            <TrackCard
              key={track.id}
              opportunityId={opportunityId}
              track={track}
              canManage={canManage}
              canApprove={canApprove}
              pending={pending}
              onSubmit={submit}
            />
          ))}
        </div>
      )}
      {error && <p className="track-error" role="alert">{error}</p>}
      {success && <p className="track-success" role="status">{success}</p>}
      <style>{`
        .track-count { color: var(--color-neutral-500); font-size: 12px; }
        .track-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 14px 16px 16px; }
        .track-card { border: 1px solid var(--color-border); border-radius: 7px; padding: 13px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .track-card-header { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
        .track-card h3 { margin: 0; font-size: 13px; color: var(--color-neutral-900); }
        .track-status { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 999px; font-size: 10px; text-transform: capitalize; white-space: nowrap; }
        .track-status.pending { background: #f3f4f6; color: #4b5563; }
        .track-status.in_review { background: #fff7ed; color: #c2410c; }
        .track-status.approved { background: #ecfdf5; color: #047857; }
        .track-status.flagged, .track-status.rejected { background: #fef2f2; color: #b91c1c; }
        .track-meta { display: grid; gap: 5px; color: var(--color-neutral-500); font-size: 11px; line-height: 1.35; }
        .track-meta strong { color: var(--color-neutral-700); font-weight: 600; }
        .track-reason { margin: 0; padding: 8px; border-radius: 5px; background: #fff7ed; color: #9a3412; font-size: 11px; line-height: 1.4; }
        .track-form { display: grid; gap: 7px; }
        .track-notes { width: 100%; box-sizing: border-box; min-height: 52px; resize: vertical; padding: 7px 8px; font: inherit; font-size: 12px; border: 1px solid var(--color-border); border-radius: 4px; }
        .track-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .track-action { border: 1px solid var(--color-border); border-radius: 4px; background: white; color: var(--color-neutral-700); padding: 6px 8px; font: inherit; font-size: 11px; cursor: pointer; }
        .track-action.primary { border-color: var(--color-navy-700); background: var(--color-navy-700); color: white; }
        .track-action.danger { border-color: #fecaca; color: #b91c1c; }
        .track-action:disabled { opacity: .55; cursor: wait; }
        .track-error, .track-success { margin: 0; padding: 0 16px 14px; font-size: 12px; }
        .track-error { color: var(--color-danger, #b91c1c); }
        .track-success { color: var(--color-success, #047857); }
        @media (max-width: 720px) { .track-list { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  )
}

function TrackCard({
  opportunityId,
  track,
  canManage,
  canApprove,
  pending,
  onSubmit,
}: {
  opportunityId: string
  track: OpportunityKycTrackView
  canManage: boolean
  canApprove: boolean
  pending: boolean
  onSubmit: (formData: FormData) => void
}) {
  const status = opportunityKycTrackStatusLabel(track.status)
  const due = new Date(track.due_at)
  const overdue = due.getTime() < Date.now() && track.status !== 'approved'

  return (
    <article className="track-card">
      <div className="track-card-header">
        <h3>{opportunityKycTrackLabel(track.track_type)}</h3>
        <span className={`track-status ${track.status}`}>{status}</span>
      </div>
      <div className="track-meta">
        <div><strong>Due:</strong> <span style={overdue ? { color: '#b91c1c' } : undefined}>{due.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}{overdue ? ' · overdue' : ''}</span></div>
        <div><strong>Prepared:</strong> {track.prepared_at ? 'complete' : 'pending'}</div>
        <div><strong>FC recommendation:</strong> {track.fc_recommended_at ? 'complete' : 'pending'}</div>
        <div><strong>President decision:</strong> {track.president_decided_at ? 'complete' : 'pending'}</div>
      </div>
      {track.decision_reason && <p className="track-reason">{track.decision_reason}</p>}
      {(canManage || canApprove) && track.status !== 'approved' && (
        <form action={onSubmit} className="track-form">
          <input type="hidden" name="opportunity_id" value={opportunityId} />
          <input type="hidden" name="track_type" value={track.track_type} />
          <textarea name="notes" className="track-notes" placeholder="Decision notes; required for flag or reject." defaultValue={track.notes ?? track.decision_reason ?? ''} />
          <div className="track-actions">
            {canManage && (track.status === 'pending' || track.status === 'in_review') && (
              <>
                {track.status === 'pending' && <button className="track-action" name="action" value="start" disabled={pending}>Start review</button>}
                <button className="track-action primary" name="action" value="recommend" disabled={pending}>Recommend clear</button>
                <button className="track-action danger" name="action" value="flag" disabled={pending}>Flag</button>
              </>
            )}
            {canApprove && track.fc_recommended_at && track.status !== 'rejected' && (
              <button className="track-action primary" name="action" value="approve" disabled={pending}>Approve</button>
            )}
            {canApprove && track.status !== 'rejected' && (
              <button className="track-action danger" name="action" value="reject" disabled={pending}>Reject</button>
            )}
          </div>
        </form>
      )}
    </article>
  )
}
