'use client'

import { useActionState, useEffect, useState } from 'react'
import type {
  QualityHoldPointListResult,
  QualityHoldPointRow,
  QualityHoldPointStatus,
} from '@third-code-erp/shared-types'
import {
  createQualityHoldPoint,
  transitionQualityHoldPoint,
  updateQualityHoldPoint,
  handoffQualityHoldPointToPunchlist,
  type QualityActionState,
} from './actions'

interface QualityHoldPointRegisterProps {
  projectId: string
  result: QualityHoldPointListResult | null
  error: string | null
  canManage: boolean
  canApprove: boolean
  canPunchlist: boolean
  activeStatus?: QualityHoldPointStatus
  activeHoldPoint?: boolean
  filterHref: (filters: { status?: QualityHoldPointStatus; holdPoint?: boolean; page?: number }) => string
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
}

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusClass(status: QualityHoldPointStatus): string {
  if (status === 'accepted') return 'stage-badge stage-closed_won'
  if (status === 'rejected') return 'stage-badge stage-closed_lost'
  if (status === 'submitted') return 'stage-badge stage-negotiation'
  if (status === 'ready') return 'stage-badge stage-resubmission'
  return 'stage-badge stage-opportunity_creation'
}

function CreateQualityForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<QualityActionState, FormData>(createQualityHoldPoint, { ok: true })
  const [clientRequestId, setClientRequestId] = useState('')
  useEffect(() => setClientRequestId(globalThis.crypto.randomUUID()), [])
  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary className="card-header" style={{ cursor: 'pointer', listStylePosition: 'inside' }}>
        <span className="card-title">New IWR / hold point</span>
        <span className="card-subtitle" style={{ marginLeft: 8 }}>Define the work, location, and plan reference before requesting inspection.</span>
      </summary>
      <form action={action} style={{ display: 'grid', gap: 12, padding: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <label className="form-label">Title<input className="form-input" name="title" required maxLength={200} placeholder="Concrete pour inspection" disabled={pending} /></label>
        <label className="form-label">Discipline<input className="form-input" name="discipline" maxLength={120} placeholder="Structural" disabled={pending} /></label>
        <label className="form-label">Inspection date<input className="form-input" name="inspectionDate" type="date" disabled={pending} /></label>
        <label className="form-label">Hold point?<select className="form-input" name="holdPoint" defaultValue="true" disabled={pending}><option value="true">Yes — stop before work continues</option><option value="false">No — witness / routine check</option></select></label>
        <label className="form-label">Location<input className="form-input" name="location" maxLength={200} placeholder="Level 2 slab" disabled={pending} /></label>
        <label className="form-label">Plan reference<input className="form-input" name="planReference" maxLength={200} placeholder="S-201 detail 4" disabled={pending} /></label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>Description<textarea className="form-input" name="description" required maxLength={10000} rows={3} placeholder="State the inspection scope and acceptance context." disabled={pending} /></label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="button-primary" disabled={pending || clientRequestId.length === 0}>{pending ? 'Creating…' : 'Create draft IWR'}</button>
          <span className="form-help">A stable request token prevents duplicate records when a field connection retries.</span>
        </div>
        {state.error ? <p role="alert" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0, color: 'var(--color-danger)' }}>{state.error}</p> : null}
        {state.success ? <p role="status" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0 }}>{state.success}</p> : null}
      </form>
    </details>
  )
}

function EditQualityForm({ projectId, row }: { projectId: string; row: QualityHoldPointRow }) {
  const [state, action, pending] = useActionState<QualityActionState, FormData>(updateQualityHoldPoint, { ok: true })
  return (
    <details>
      <summary className="button-secondary" style={{ cursor: 'pointer' }}>Edit request</summary>
      <form action={action} style={{ display: 'grid', gap: 10, marginTop: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="entryId" value={row.id} /><input type="hidden" name="expectedVersion" value={row.version} />
        <label className="form-label">Title<input className="form-input" name="title" required maxLength={200} defaultValue={row.title} disabled={pending} /></label>
        <label className="form-label">Discipline<input className="form-input" name="discipline" maxLength={120} defaultValue={row.discipline} disabled={pending} /></label>
        <label className="form-label">Inspection date<input className="form-input" name="inspectionDate" type="date" defaultValue={row.inspectionDate ?? ''} disabled={pending} /></label>
        <label className="form-label">Hold point?<select className="form-input" name="holdPoint" defaultValue={String(row.holdPoint)} disabled={pending}><option value="true">Yes</option><option value="false">No</option></select></label>
        <label className="form-label">Location<input className="form-input" name="location" maxLength={200} defaultValue={row.location} disabled={pending} /></label>
        <label className="form-label">Plan reference<input className="form-input" name="planReference" maxLength={200} defaultValue={row.planReference} disabled={pending} /></label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>Description<textarea className="form-input" name="description" required maxLength={10000} rows={3} defaultValue={row.description} disabled={pending} /></label>
        <button type="submit" className="button-secondary" disabled={pending}>{pending ? 'Saving…' : 'Save request'}</button>
        {state.error ? <p role="alert" aria-live="polite" style={{ margin: 0, color: 'var(--color-danger)' }}>{state.error}</p> : null}
        {state.success ? <p role="status" aria-live="polite" style={{ margin: 0 }}>{state.success}</p> : null}
      </form>
    </details>
  )
}

function TransitionForm({ projectId, row, target, canApprove }: { projectId: string; row: QualityHoldPointRow; target: 'ready' | 'submit' | 'accept' | 'reject'; canApprove: boolean }) {
  const [state, action, pending] = useActionState<QualityActionState, FormData>(transitionQualityHoldPoint, { ok: true })
  if (target === 'accept' && !canApprove) return null
  const title = target === 'ready' ? 'Mark ready' : target === 'submit' ? 'Submit IWR' : target === 'accept' ? 'Accept inspection' : 'Reject inspection'
  return (
    <details>
      <summary className="button-secondary" style={{ cursor: 'pointer' }}>{title}</summary>
      <form action={action} style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="entryId" value={row.id} /><input type="hidden" name="target" value={target} /><input type="hidden" name="expectedVersion" value={row.version} />
        {target === 'submit' ? <label className="form-label">Request notes<textarea className="form-input" name="requestNotes" maxLength={10000} rows={2} placeholder="What should the inspector verify?" disabled={pending} /></label> : null}
        {target === 'accept' || target === 'reject' ? <label className="form-label">Findings<textarea className="form-input" name="findings" maxLength={10000} rows={2} placeholder="Record observed findings." disabled={pending} /></label> : null}
        {target === 'accept' ? <label className="form-label">Acceptance notes<textarea className="form-input" name="acceptanceNotes" maxLength={10000} rows={2} placeholder="Acceptance conditions or follow-up." disabled={pending} /></label> : null}
        {target === 'reject' ? <label className="form-label">Rejection reason<textarea className="form-input" name="reason" required maxLength={5000} rows={2} placeholder="What must be corrected before reinspection?" disabled={pending} /></label> : null}
        <button type="submit" className={target === 'accept' ? 'button-primary' : 'button-secondary'} disabled={pending}>{pending ? 'Saving…' : title}</button>
        {state.error ? <p role="alert" aria-live="polite" style={{ margin: 0, color: 'var(--color-danger)' }}>{state.error}</p> : null}
        {state.success ? <p role="status" aria-live="polite" style={{ margin: 0 }}>{state.success}</p> : null}
      </form>
    </details>
  )
}

function PunchlistHandoffForm({ projectId, row }: { projectId: string; row: QualityHoldPointRow }) {
  const [state, action, pending] = useActionState<QualityActionState, FormData>(handoffQualityHoldPointToPunchlist, { ok: true })
  const [clientRequestId, setClientRequestId] = useState('')
  useEffect(() => setClientRequestId(globalThis.crypto.randomUUID()), [])
  return (
    <details>
      <summary className="button-primary" style={{ cursor: 'pointer' }}>Create punchlist work</summary>
      <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface-subtle)' }}>
        <div className="form-help">Source evidence from {row.iwrNumber} is retained with the handoff.</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {row.findings ? <div><strong>Findings:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{row.findings}</span></div> : null}
          <div><strong>Correction required:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{row.rejectionReason}</span></div>
          <div><strong>Plan reference:</strong> {row.planReference || '—'}</div>
        </div>
      </div>
      <form action={action} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="entryId" value={row.id} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <label className="form-label">Punchlist corrections <span className="form-help">one item per line</span><textarea className="form-input" name="descriptions" required minLength={3} maxLength={10000} rows={3} defaultValue={row.rejectionReason} placeholder="Describe each correction to track to closure." disabled={pending} /></label>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <label className="form-label">Trade<input className="form-input" name="trade" maxLength={120} placeholder={row.discipline || 'Trade'} disabled={pending} /></label>
          <label className="form-label">Location<input className="form-input" name="location" maxLength={255} defaultValue={row.location} disabled={pending} /></label>
          <label className="form-label">Priority<select className="form-input" name="priority" defaultValue="medium" disabled={pending}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label className="form-label">Due date<input className="form-input" name="dueDate" type="date" disabled={pending} /></label>
        </div>
        <label className="form-label">Plan document ID <span className="form-help">optional UUID; must belong to this project</span><input className="form-input" name="planDocumentId" placeholder="Attach project plan evidence by document ID" disabled={pending} /></label>
        <label className="form-label">Assigned party<input className="form-input" name="assignedToText" maxLength={255} placeholder="Subcontractor or responsible party" disabled={pending} /></label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="button-primary" disabled={pending || clientRequestId.length === 0}>{pending ? 'Creating…' : 'Create punchlist items'}</button>
          <span className="form-help">One handoff per rejected IWR. Retrying this form reuses its request token.</span>
        </div>
        {state.error ? <p role="alert" aria-live="polite" style={{ margin: 0, color: 'var(--color-danger)' }}>{state.error}</p> : null}
        {state.success ? <p role="status" aria-live="polite" style={{ margin: 0 }}>{state.success}</p> : null}
      </form>
    </details>
  )
}

function QualityEntry({ projectId, row, canManage, canApprove, canPunchlist }: { projectId: string; row: QualityHoldPointRow; canManage: boolean; canApprove: boolean; canPunchlist: boolean }) {
  const canEdit = canManage && !row.punchlistHandoffAt && (row.status === 'planned' || row.status === 'rejected')
  return (
    <article className="card" style={{ marginBottom: 12 }} aria-labelledby={`quality-${row.id}`}>
      <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div><h3 id={`quality-${row.id}`} className="card-title">{row.iwrNumber} · {row.title}</h3><p className="card-subtitle">Created {dateTime(row.createdAt)} · requested by {row.requestedBy} · version {row.version}</p></div>
        <span className={statusClass(row.status)}><span className="stage-badge-dot" /> {label(row.status)}{row.holdPoint ? ' · Hold point' : ' · Witness'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, padding: '0 16px 16px' }}>
        <div><div className="form-help">Discipline / location</div><div>{row.discipline || '—'}{row.location ? ` · ${row.location}` : ''}</div></div>
        <div><div className="form-help">Inspection date</div><div>{row.inspectionDate ?? 'Not scheduled'}</div></div>
        <div><div className="form-help">Plan reference</div><div>{row.planReference || '—'}</div></div>
        <div style={{ gridColumn: '1 / -1' }}><div className="form-help">Scope</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.description}</div></div>
        {row.requestNotes ? <div style={{ gridColumn: '1 / -1' }}><div className="form-help">Request notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.requestNotes}</div></div> : null}
        {row.findings ? <div style={{ gridColumn: '1 / -1' }}><div className="form-help">Findings</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.findings}</div></div> : null}
        {row.rejectionReason ? <div style={{ gridColumn: '1 / -1', color: 'var(--color-danger)' }}><div className="form-help">Correction required</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.rejectionReason}</div></div> : null}
        {row.acceptanceNotes ? <div style={{ gridColumn: '1 / -1' }}><div className="form-help">Acceptance notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{row.acceptanceNotes}</div></div> : null}
      </div>
      <div className="form-help" style={{ padding: '0 16px 14px' }}>{row.submittedAt ? `Submitted ${dateTime(row.submittedAt)}.` : 'Not yet submitted.'}{row.acceptedAt ? ` Accepted ${dateTime(row.acceptedAt)}.` : ''}{row.rejectedAt ? ` Rejected ${dateTime(row.rejectedAt)}.` : ''}</div>
      {((canManage && (canEdit || row.status === 'planned' || row.status === 'ready' || row.status === 'submitted')) || (canPunchlist && row.status === 'rejected')) ? <div style={{ borderTop: '1px solid var(--color-border)', padding: 16, display: 'grid', gap: 10 }}>
        {canEdit ? <EditQualityForm projectId={projectId} row={row} /> : null}
        {canManage && !row.punchlistHandoffAt && (row.status === 'planned' || row.status === 'rejected') ? <TransitionForm projectId={projectId} row={row} target="ready" canApprove={canApprove} /> : null}
        {row.status === 'ready' ? <TransitionForm projectId={projectId} row={row} target="submit" canApprove={canApprove} /> : null}
        {row.status === 'submitted' ? <><TransitionForm projectId={projectId} row={row} target="accept" canApprove={canApprove} /><TransitionForm projectId={projectId} row={row} target="reject" canApprove={canApprove} /></> : null}
        {canPunchlist && row.status === 'rejected' && !row.punchlistHandoffAt ? <PunchlistHandoffForm projectId={projectId} row={row} /> : null}
        {row.punchlistHandoffAt ? <p className="form-help" role="status">Punchlist handoff recorded {dateTime(row.punchlistHandoffAt)}{row.punchlistHandoffBy ? ` by ${row.punchlistHandoffBy}` : ''}. Linked items are traceable from Punchlist.</p> : null}
      </div> : null}
    </article>
  )
}

function ReadOnlyQualityEntry({ row }: { row: QualityHoldPointRow }) {
  return <article className="card" style={{ marginBottom: 12 }} aria-labelledby={`quality-readonly-${row.id}`}><div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h3 id={`quality-readonly-${row.id}`} className="card-title">{row.iwrNumber} · {row.title}</h3><p className="card-subtitle">{row.discipline || 'General'} · {row.location || 'No location'}</p></div><span className={statusClass(row.status)}><span className="stage-badge-dot" /> {label(row.status)}</span></div><div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}><div><div className="form-help">Scope</div><div>{row.description}</div></div><div><div className="form-help">Plan reference</div><div>{row.planReference || '—'}</div></div></div></article>
}

export function QualityHoldPointRegister({ projectId, result, error, canManage, canApprove, canPunchlist, activeStatus, activeHoldPoint, filterHref }: QualityHoldPointRegisterProps) {
  if (error) return <section className="card" aria-labelledby="quality-register"><div className="card-header"><h2 id="quality-register" className="card-title">QA/QC hold points</h2></div><div className="card-empty" role="alert">{error}</div></section>
  if (!result) return null
  const counts = result.rows.reduce<Record<QualityHoldPointStatus, number>>((all, row) => ({ ...all, [row.status]: (all[row.status] ?? 0) + 1 }), { planned: 0, ready: 0, submitted: 0, accepted: 0, rejected: 0 })
  const hasPrevious = result.page > 1
  const hasNext = result.page < result.totalPages
  return (
    <section aria-labelledby="quality-register">
      {canManage ? <CreateQualityForm projectId={projectId} /> : <p className="form-help" style={{ margin: '0 0 12px' }}>Read-only access. Quality request changes require delivery, safety, or project-management authority.</p>}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}><div><h2 id="quality-register" className="card-title">Inspection work requests</h2><p className="card-subtitle">{result.total} total · {counts.submitted} awaiting inspection · {counts.rejected} rejected on this page</p></div><span className="badge">Page {result.page} of {result.totalPages}</span></div>
        <form method="get" style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div><label className="form-label" htmlFor="quality-status">Status</label><select id="quality-status" className="form-input" name="status" defaultValue={activeStatus ?? ''}><option value="">All statuses</option>{(['planned', 'ready', 'submitted', 'accepted', 'rejected'] as QualityHoldPointStatus[]).map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div>
          <div><label className="form-label" htmlFor="quality-hold-point">Type</label><select id="quality-hold-point" className="form-input" name="holdPoint" defaultValue={activeHoldPoint === undefined ? '' : String(activeHoldPoint)}><option value="">All checks</option><option value="true">Hold points</option><option value="false">Witness / routine</option></select></div>
          <input type="hidden" name="page" value="1" /><input type="hidden" name="limit" value={result.limit} /><button type="submit" className="button-secondary">Apply filters</button>
        </form>
        {result.rows.length === 0 ? <div className="card-empty" role="status">No quality requests match these filters.</div> : <div style={{ padding: '0 12px 4px' }}>{result.rows.map((row) => canManage || (canPunchlist && row.status === 'rejected') ? <QualityEntry key={row.id} projectId={projectId} row={row} canManage={canManage} canApprove={canApprove} canPunchlist={canPunchlist} /> : <ReadOnlyQualityEntry key={row.id} row={row} />)}</div>}
        {(hasPrevious || hasNext) ? <nav aria-label="Quality request pages" style={{ display: 'flex', justifyContent: 'space-between', padding: 14 }}>{hasPrevious ? <a className="button-secondary" href={filterHref({ status: activeStatus, holdPoint: activeHoldPoint, page: result.page - 1 })}>Previous</a> : <span />}{hasNext ? <a className="button-secondary" href={filterHref({ status: activeStatus, holdPoint: activeHoldPoint, page: result.page + 1 })}>Next</a> : null}</nav> : null}
      </div>
    </section>
  )
}
