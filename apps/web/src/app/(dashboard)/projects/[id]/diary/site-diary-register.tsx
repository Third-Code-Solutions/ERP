'use client'

import { useActionState, useEffect, useState } from 'react'
import type {
  SiteDiaryListResult,
  SiteDiaryRow,
  SiteDiaryStatus,
} from '@third-code-erp/shared-types'
import {
  createSiteDiary,
  submitSiteDiary,
  updateSiteDiary,
  type SiteDiaryActionState,
} from './actions'

interface SiteDiaryRegisterProps {
  projectId: string
  result: SiteDiaryListResult | null
  error: string | null
  canManage: boolean
  activeStatus?: SiteDiaryStatus
  activeFromDate?: string
  activeToDate?: string
  filterHref: (filters: { status?: SiteDiaryStatus; fromDate?: string; toDate?: string; page?: number }) => string
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function statusClass(status: SiteDiaryStatus): string {
  return status === 'submitted'
    ? 'stage-badge stage-closed_won'
    : 'stage-badge stage-opportunity_creation'
}

function CreateDiaryForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<SiteDiaryActionState, FormData>(createSiteDiary, { ok: true })
  const [clientRequestId, setClientRequestId] = useState('')
  useEffect(() => setClientRequestId(globalThis.crypto.randomUUID()), [])

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary className="card-header" style={{ cursor: 'pointer', listStylePosition: 'inside' }}>
        <span className="card-title">New daily diary</span>
        <span className="card-subtitle" style={{ marginLeft: 8 }}>
          Capture the field record before the day is submitted.
        </span>
      </summary>
      <form action={action} style={{ display: 'grid', gap: 12, padding: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <label className="form-label">
          Diary date
          <input className="form-input" name="diaryDate" type="date" required disabled={pending} />
        </label>
        <label className="form-label">
          Manpower on site
          <input className="form-input" name="manpowerCount" type="number" min={0} max={100000} required defaultValue={0} disabled={pending} />
        </label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>
          Weather / site conditions
          <input className="form-input" name="weather" maxLength={160} placeholder="Cloudy, intermittent rain" disabled={pending} />
        </label>
        <label className="form-label">
          Work completed
          <textarea className="form-input" name="workCompleted" maxLength={20000} rows={4} placeholder="Activities completed today" disabled={pending} />
        </label>
        <label className="form-label">
          Constraints / delays
          <textarea className="form-input" name="constraints" maxLength={20000} rows={4} placeholder="Access, design, material, or weather constraints" disabled={pending} />
        </label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>
          Safety notes
          <textarea className="form-input" name="safetyNotes" maxLength={20000} rows={3} placeholder="Toolbox talk, hazards, observations" disabled={pending} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="button-primary" disabled={pending || clientRequestId.length === 0}>
            {pending ? 'Creating…' : 'Create draft'}
          </button>
          <span className="form-help">A draft can be edited until it is submitted.</span>
        </div>
        {state.error ? <p role="alert" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0, color: 'var(--color-danger)' }}>{state.error}</p> : null}
        {state.success ? <p role="status" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0 }}>{state.success}</p> : null}
      </form>
    </details>
  )
}

function DiaryEntry({ projectId, row }: { projectId: string; row: SiteDiaryRow }) {
  const [updateState, updateAction, updatePending] = useActionState<SiteDiaryActionState, FormData>(updateSiteDiary, { ok: true })
  const [submitState, submitAction, submitPending] = useActionState<SiteDiaryActionState, FormData>(submitSiteDiary, { ok: true })
  const pending = updatePending || submitPending

  return (
    <article className="card" style={{ marginBottom: 12 }} aria-labelledby={`diary-${row.id}`}>
      <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 id={`diary-${row.id}`} className="card-title">{row.diaryDate}</h3>
          <p className="card-subtitle">Recorded {dateTime(row.createdAt)} · by {row.createdBy} · version {row.version}</p>
        </div>
        <span className={statusClass(row.status)}><span className="stage-badge-dot" /> {row.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, padding: '0 16px 16px' }}>
        <div><div className="form-help">Weather / conditions</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.weather || '—'}</div></div>
        <div><div className="form-help">Manpower</div><div>{row.manpowerCount.toLocaleString('en-PH')}</div></div>
        <div style={{ gridColumn: '1 / -1' }}><div className="form-help">Work completed</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.workCompleted || '—'}</div></div>
        <div><div className="form-help">Constraints / delays</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.constraints || '—'}</div></div>
        <div><div className="form-help">Safety notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.safetyNotes || '—'}</div></div>
      </div>

      {row.submittedAt ? (
        <div className="form-help" style={{ padding: '0 16px 14px' }}>Submitted {dateTime(row.submittedAt)}{row.submittedBy ? ` by ${row.submittedBy}` : ''}. Submitted records are immutable.</div>
      ) : null}

      {row.status === 'draft' ? (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 16, display: 'grid', gap: 12 }}>
          <details>
            <summary className="button-secondary" style={{ cursor: 'pointer' }}>Edit draft</summary>
            <form action={updateAction} style={{ display: 'grid', gap: 10, marginTop: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="entryId" value={row.id} />
              <input type="hidden" name="expectedVersion" value={row.version} />
              <label className="form-label">Weather<input className="form-input" name="weather" maxLength={160} defaultValue={row.weather} disabled={pending} /></label>
              <label className="form-label">Manpower<input className="form-input" name="manpowerCount" type="number" min={0} max={100000} required defaultValue={row.manpowerCount} disabled={pending} /></label>
              <label className="form-label" style={{ gridColumn: '1 / -1' }}>Work completed<textarea className="form-input" name="workCompleted" maxLength={20000} rows={3} defaultValue={row.workCompleted} disabled={pending} /></label>
              <label className="form-label">Constraints<textarea className="form-input" name="constraints" maxLength={20000} rows={3} defaultValue={row.constraints} disabled={pending} /></label>
              <label className="form-label">Safety notes<textarea className="form-input" name="safetyNotes" maxLength={20000} rows={3} defaultValue={row.safetyNotes} disabled={pending} /></label>
              <button type="submit" className="button-secondary" disabled={pending}>{updatePending ? 'Saving…' : 'Save draft'}</button>
            </form>
          </details>
          <form action={submitAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="entryId" value={row.id} />
            <input type="hidden" name="expectedVersion" value={row.version} />
            <button type="submit" className="button-primary" disabled={pending}>{submitPending ? 'Submitting…' : 'Submit diary'}</button>
          </form>
          {updateState.error || submitState.error ? <p role="alert" aria-live="polite" style={{ margin: 0, color: 'var(--color-danger)' }}>{updateState.error ?? submitState.error}</p> : null}
          {updateState.success || submitState.success ? <p role="status" aria-live="polite" style={{ margin: 0 }}>{updateState.success ?? submitState.success}</p> : null}
        </div>
      ) : null}
    </article>
  )
}

export function SiteDiaryRegister({
  projectId,
  result,
  error,
  canManage,
  activeStatus,
  activeFromDate,
  activeToDate,
  filterHref,
}: SiteDiaryRegisterProps) {
  if (error) {
    return <section className="card" aria-labelledby="site-diary-register"><div className="card-header"><h2 id="site-diary-register" className="card-title">Daily site diary</h2></div><div className="card-empty" role="alert">{error}</div></section>
  }
  if (!result) return null
  const draftCount = result.rows.filter((row) => row.status === 'draft').length
  const submittedCount = result.rows.filter((row) => row.status === 'submitted').length
  const hasPrevious = result.page > 1
  const hasNext = result.page < result.totalPages

  return (
    <section aria-labelledby="site-diary-register">
      {canManage ? <CreateDiaryForm projectId={projectId} /> : <p className="form-help" style={{ margin: '0 0 12px' }}>Read-only access. Daily diary submission is restricted to delivery and safety roles.</p>}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div><h2 id="site-diary-register" className="card-title">Daily site diary</h2><p className="card-subtitle">{result.total} total · {draftCount} draft · {submittedCount} submitted on this page</p></div>
          <span className="badge">Page {result.page} of {result.totalPages}</span>
        </div>
        <form method="get" style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div><label className="form-label" htmlFor="site-diary-status">Status</label><select id="site-diary-status" className="form-input" name="status" defaultValue={activeStatus ?? ''}><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option></select></div>
          <div><label className="form-label" htmlFor="site-diary-from">From date</label><input id="site-diary-from" className="form-input" name="fromDate" type="date" defaultValue={activeFromDate ?? ''} /></div>
          <div><label className="form-label" htmlFor="site-diary-to">To date</label><input id="site-diary-to" className="form-input" name="toDate" type="date" defaultValue={activeToDate ?? ''} /></div>
          <input type="hidden" name="page" value="1" /><input type="hidden" name="limit" value={result.limit} /><button type="submit" className="button-secondary">Apply filters</button>
        </form>
        {result.rows.length === 0 ? <div className="card-empty" role="status">No daily diary entries match these filters.</div> : <div style={{ padding: '0 12px 4px' }}>{result.rows.map((row) => canManage ? <DiaryEntry key={row.id} projectId={projectId} row={row} /> : <DiaryEntryReadOnly key={row.id} row={row} />)}</div>}
        {(hasPrevious || hasNext) ? <nav aria-label="Site diary pages" style={{ display: 'flex', justifyContent: 'space-between', padding: 14 }}>{hasPrevious ? <a className="button-secondary" href={filterHref({ status: activeStatus, fromDate: activeFromDate, toDate: activeToDate, page: result.page - 1 })}>Previous</a> : <span />}{hasNext ? <a className="button-secondary" href={filterHref({ status: activeStatus, fromDate: activeFromDate, toDate: activeToDate, page: result.page + 1 })}>Next</a> : null}</nav> : null}
      </div>
    </section>
  )
}

function DiaryEntryReadOnly({ row }: { row: SiteDiaryRow }) {
  return <article className="card" style={{ marginBottom: 12 }} aria-labelledby={`diary-readonly-${row.id}`}><div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h3 id={`diary-readonly-${row.id}`} className="card-title">{row.diaryDate}</h3><p className="card-subtitle">Recorded {dateTime(row.createdAt)} · by {row.createdBy}</p></div><span className={statusClass(row.status)}><span className="stage-badge-dot" /> {row.status === 'submitted' ? 'Submitted' : 'Draft'}</span></div><div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}><div><div className="form-help">Work completed</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.workCompleted || '—'}</div></div><div><div className="form-help">Constraints</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.constraints || '—'}</div></div><div><div className="form-help">Safety notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.safetyNotes || '—'}</div></div></div></article>
}
