'use client'

import { useActionState } from 'react'
import type {
  InspectionRfiListResult,
  InspectionRfiRow,
} from '@third-code-erp/shared-types'
import {
  transitionInspectionRfi,
  type InspectionRfiTransitionActionState,
} from './actions'

interface InspectionRfiRegisterProps {
  opportunityId: string
  result: InspectionRfiListResult | null
  error: string | null
  canMutate: boolean
  filterHref: (filters: {
    status?: string
    priority?: string
    page?: number
  }) => string
  activeStatus?: string
  activePriority?: string
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function TransitionControl({
  opportunityId,
  row,
  canMutate,
}: {
  opportunityId: string
  row: InspectionRfiRow
  canMutate: boolean
}) {
  const [state, action, pending] = useActionState<
    InspectionRfiTransitionActionState,
    FormData
  >(transitionInspectionRfi, { ok: true })
  if (!canMutate) return <span className="muted">Read only</span>

  const target = row.resolvedAt ? 'reopen' : 'resolve'
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 190 }}>
      <details>
        <summary className="button-secondary" style={{ cursor: 'pointer' }}>
          {target === 'resolve' ? 'Resolve' : 'Reopen'}
        </summary>
        <form action={action} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <input type="hidden" name="rfiId" value={row.id} />
          <input type="hidden" name="target" value={target} />
          <input
            type="hidden"
            name="expectedResolvedAt"
            value={row.resolvedAt ?? ''}
          />
          <label className="form-label" htmlFor={`rfi-reason-${row.id}`}>
            Reason
            <textarea
              id={`rfi-reason-${row.id}`}
              className="form-input"
              name="reason"
              required
              minLength={1}
              maxLength={2000}
              rows={3}
              placeholder={
                target === 'resolve'
                  ? 'What evidence closed this RFI?'
                  : 'Why is this RFI open again?'
              }
              disabled={pending}
            />
          </label>
          <button type="submit" className="button-primary" disabled={pending}>
            {pending ? 'Saving…' : `Confirm ${target}`}
          </button>
        </form>
      </details>
      {state.error ? (
        <p role="alert" aria-live="polite" style={{ margin: 0, color: 'var(--color-danger)' }}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" aria-live="polite" style={{ margin: 0 }}>
          {state.success}
        </p>
      ) : null}
    </div>
  )
}

export function InspectionRfiRegister({
  opportunityId,
  result,
  error,
  canMutate,
  filterHref,
  activeStatus,
  activePriority,
}: InspectionRfiRegisterProps) {
  if (error) {
    return (
      <section className="card" aria-labelledby="inspection-rfi-register">
        <div className="card-header">
          <h2 id="inspection-rfi-register" className="card-title">
            Inspection RFI register
          </h2>
        </div>
        <div className="card-empty" role="alert">
          {error}
        </div>
      </section>
    )
  }
  if (!result) return null

  const openCount = result.rows.filter((row) => !row.resolvedAt).length
  const resolvedCount = result.rows.filter((row) => row.resolvedAt).length
  const hasPrevious = result.page > 1
  const hasNext = result.page < result.totalPages

  return (
    <section className="card" aria-labelledby="inspection-rfi-register">
      <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2 id="inspection-rfi-register" className="card-title">
            Inspection RFI register
          </h2>
          <p className="card-subtitle">
            Opportunity-wide register · {result.total} total · {openCount} open on this page · {resolvedCount} resolved on this page
          </p>
        </div>
        <span className="badge">Page {result.page} of {result.totalPages}</span>
      </div>

      <form method="get" style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div>
          <label className="form-label" htmlFor="inspection-rfi-status">Status</label>
          <select id="inspection-rfi-status" className="form-input" name="rfiStatus" defaultValue={activeStatus ?? ''}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="inspection-rfi-priority">Priority</label>
          <select id="inspection-rfi-priority" className="form-input" name="rfiPriority" defaultValue={activePriority ?? ''}>
            <option value="">All priorities</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
          </select>
        </div>
        <input type="hidden" name="rfiPage" value="1" />
        <input type="hidden" name="rfiLimit" value={result.limit} />
        <button type="submit" className="button-secondary">Apply filters</button>
      </form>

      {result.rows.length === 0 ? (
        <div className="card-empty" role="status">
          No inspection RFIs match these filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <caption className="sr-only">Inspection RFIs across this opportunity</caption>
            <thead>
              <tr>
                <th>Description</th>
                <th>Priority</th>
                <th>Source inspection</th>
                <th>Status</th>
                <th>Created</th>
                <th>Resolved</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.description}</td>
                  <td>{label(row.priority)}</td>
                  <td>
                    <div>{row.inspectionId}</div>
                    <div className="muted">{label(row.inspectionStatus)}</div>
                  </td>
                  <td>{row.resolvedAt ? 'Resolved' : 'Open'}</td>
                  <td>{dateTime(row.createdAt)}</td>
                  <td>
                    {row.resolvedAt ? (
                      <>
                        <div>{dateTime(row.resolvedAt)}</div>
                        <div className="muted">{row.resolvedBy ?? 'Actor unavailable'}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <TransitionControl opportunityId={opportunityId} row={row} canMutate={canMutate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(hasPrevious || hasNext) ? (
        <nav aria-label="Inspection RFI pages" style={{ display: 'flex', justifyContent: 'space-between', padding: 14 }}>
          {hasPrevious ? <a className="button-secondary" href={filterHref({ status: activeStatus, priority: activePriority, page: result.page - 1 })}>Previous</a> : <span />}
          {hasNext ? <a className="button-secondary" href={filterHref({ status: activeStatus, priority: activePriority, page: result.page + 1 })}>Next</a> : null}
        </nav>
      ) : null}
    </section>
  )
}
