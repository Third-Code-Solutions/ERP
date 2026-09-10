'use client'

import { useActionState, useEffect, useState } from 'react'
import type {
  ProjectRfiListResult,
  ProjectRfiPriority,
  ProjectRfiRow,
  ProjectRfiStatus,
} from '@third-code-erp/shared-types'
import {
  createProjectRfi,
  transitionProjectRfi,
  type ProjectRfiActionState,
} from './actions'

interface ProjectRfiRegisterProps {
  projectId: string
  result: ProjectRfiListResult | null
  error: string | null
  canManage: boolean
  activeStatus?: ProjectRfiStatus
  activePriority?: ProjectRfiPriority
}

function projectRfiHref(
  projectId: string,
  filters: {
    status?: ProjectRfiStatus
    priority?: ProjectRfiPriority
    page?: number
    limit?: number
  },
): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  if (filters.limit && filters.limit !== 25) params.set('limit', String(filters.limit))
  const query = params.toString()
  return `/projects/${projectId}/rfis${query ? `?${query}` : ''}`
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function dateOnly(value: string | null): string {
  if (!value) return 'No due date'
  return new Date(value).toLocaleDateString('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  })
}

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusTone(status: ProjectRfiStatus): string {
  if (status === 'closed') return 'stage-badge stage-closed_won'
  if (status === 'answered') return 'stage-badge stage-negotiation'
  return 'stage-badge stage-opportunity_creation'
}

function priorityTone(priority: ProjectRfiPriority): string {
  if (priority === 'critical') return 'stage-badge stage-closed_lost'
  if (priority === 'high') return 'stage-badge stage-resubmission'
  return 'stage-badge'
}

function CreateProjectRfiForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<
    ProjectRfiActionState,
    FormData
  >(createProjectRfi, { ok: true })
  const [clientRequestId, setClientRequestId] = useState('')

  useEffect(() => {
    setClientRequestId(crypto.randomUUID())
  }, [])

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary
        className="card-header"
        style={{ cursor: 'pointer', listStylePosition: 'inside' }}
      >
        <span className="card-title">New project RFI</span>
        <span className="card-subtitle" style={{ marginLeft: 8 }}>
          Ask a question, assign a due date, and keep the response auditable.
        </span>
      </summary>
      <form
        action={action}
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <label className="form-label">
          Subject
          <input
            className="form-input"
            name="subject"
            required
            maxLength={200}
            placeholder="Confirm coordinated opening"
            disabled={pending}
          />
        </label>
        <label className="form-label">
          Priority
          <select className="form-input" name="priority" defaultValue="normal" disabled={pending}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="form-label">
          Due date (Manila time)
          <input className="form-input" name="dueAt" type="date" disabled={pending} />
        </label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>
          Question
          <textarea
            className="form-input"
            name="question"
            required
            minLength={1}
            maxLength={10000}
            rows={4}
            placeholder="Describe the decision or information needed."
            disabled={pending}
          />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="button-primary"
            disabled={pending || clientRequestId.length === 0}
          >
            {pending ? 'Creating…' : 'Create RFI'}
          </button>
          <span className="form-help">
            The request token prevents duplicate RFIs if the submission is retried.
          </span>
        </div>
        {state.error ? (
          <p role="alert" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0, color: 'var(--color-danger)' }}>
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" aria-live="polite" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {state.success}
          </p>
        ) : null}
      </form>
    </details>
  )
}

function TransitionControl({
  projectId,
  row,
}: {
  projectId: string
  row: ProjectRfiRow
}) {
  const [state, action, pending] = useActionState<
    ProjectRfiActionState,
    FormData
  >(transitionProjectRfi, { ok: true })
  const canAnswer = row.status !== 'closed'
  const canClose = row.status !== 'closed'
  const target = row.status === 'closed' ? 'reopen' : null

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 190 }}>
      {canAnswer ? (
        <details>
          <summary className="button-secondary" style={{ cursor: 'pointer' }}>
            {row.status === 'answered' ? 'Update response' : 'Answer'}
          </summary>
          <form action={action} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="rfiId" value={row.id} />
            <input type="hidden" name="target" value="answer" />
            <input type="hidden" name="expectedVersion" value={row.version} />
            <label className="form-label" htmlFor={`project-rfi-response-${row.id}`}>
              Response
              <textarea
                id={`project-rfi-response-${row.id}`}
                className="form-input"
                name="response"
                required
                minLength={1}
                maxLength={10000}
                rows={3}
                defaultValue={row.response ?? ''}
                placeholder="Record the coordinated answer."
                disabled={pending}
              />
            </label>
            <button type="submit" className="button-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save response'}
            </button>
          </form>
        </details>
      ) : null}

      {canClose ? (
        <details>
          <summary className="button-secondary" style={{ cursor: 'pointer' }}>
            Close
          </summary>
          <form action={action} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="rfiId" value={row.id} />
            <input type="hidden" name="target" value="close" />
            <input type="hidden" name="expectedVersion" value={row.version} />
            <label className="form-label" htmlFor={`project-rfi-close-${row.id}`}>
              Close reason
              <textarea
                id={`project-rfi-close-${row.id}`}
                className="form-input"
                name="reason"
                required
                minLength={1}
                maxLength={2000}
                rows={2}
                placeholder="Why is the RFI complete?"
                disabled={pending}
              />
            </label>
            <button type="submit" className="button-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Confirm close'}
            </button>
          </form>
        </details>
      ) : null}

      {target ? (
        <details>
          <summary className="button-secondary" style={{ cursor: 'pointer' }}>
            Reopen
          </summary>
          <form action={action} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="rfiId" value={row.id} />
            <input type="hidden" name="target" value="reopen" />
            <input type="hidden" name="expectedVersion" value={row.version} />
            <label className="form-label" htmlFor={`project-rfi-reopen-${row.id}`}>
              Reopen reason
              <textarea
                id={`project-rfi-reopen-${row.id}`}
                className="form-input"
                name="reason"
                required
                minLength={1}
                maxLength={2000}
                rows={2}
                placeholder="What new information requires follow-up?"
                disabled={pending}
              />
            </label>
            <button type="submit" className="button-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Confirm reopen'}
            </button>
          </form>
        </details>
      ) : null}

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

export function ProjectRfiRegister({
  projectId,
  result,
  error,
  canManage,
  activeStatus,
  activePriority,
}: ProjectRfiRegisterProps) {
  if (error) {
    return (
      <section className="card" aria-labelledby="project-rfi-register">
        <div className="card-header">
          <h2 id="project-rfi-register" className="card-title">
            Project RFI register
          </h2>
        </div>
        <div className="card-empty" role="alert">
          {error}
        </div>
      </section>
    )
  }
  if (!result) return null

  const openCount = result.rows.filter((row) => row.status === 'open').length
  const answeredCount = result.rows.filter((row) => row.status === 'answered').length
  const closedCount = result.rows.filter((row) => row.status === 'closed').length
  const hasPrevious = result.page > 1
  const hasNext = result.page < result.totalPages

  return (
    <section aria-labelledby="project-rfi-register">
      {canManage ? <CreateProjectRfiForm projectId={projectId} /> : null}
      {!canManage ? (
        <p className="form-help" style={{ margin: '0 0 12px' }}>
          Read-only access. Project RFI changes are restricted to the delivery and commercial team.
        </p>
      ) : null}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h2 id="project-rfi-register" className="card-title">
              Project RFI register
            </h2>
            <p className="card-subtitle">
              {result.total} total · {openCount} open · {answeredCount} answered · {closedCount} closed on this page
            </p>
          </div>
          <span className="badge">Page {result.page} of {result.totalPages}</span>
        </div>

        <form
          method="get"
          style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}
        >
          <div>
            <label className="form-label" htmlFor="project-rfi-status">Status</label>
            <select id="project-rfi-status" className="form-input" name="status" defaultValue={activeStatus ?? ''}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="project-rfi-priority">Priority</label>
            <select id="project-rfi-priority" className="form-input" name="priority" defaultValue={activePriority ?? ''}>
              <option value="">All priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="limit" value={result.limit} />
          <button type="submit" className="button-secondary">Apply filters</button>
        </form>

        {result.rows.length === 0 ? (
          <div className="card-empty" role="status">
            No project RFIs match these filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <caption className="sr-only">Project RFIs and auditable responses</caption>
              <thead>
                <tr>
                  <th>RFI</th>
                  <th>Question</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Response</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ minWidth: 180 }}>
                      <strong>{row.rfiNumber}</strong>
                      <div style={{ marginTop: 4 }}>{row.subject}</div>
                      <div className="muted" style={{ marginTop: 4 }}>v{row.version} · {dateTime(row.createdAt)}</div>
                    </td>
                    <td style={{ minWidth: 260, maxWidth: 360 }}>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{row.question}</span>
                      <div className="muted" style={{ marginTop: 6 }}>
                        Requested by {row.requestedBy}
                        {row.assignedTo ? ` · Assigned to ${row.assignedTo}` : ' · Unassigned'}
                      </div>
                    </td>
                    <td><span className={priorityTone(row.priority)}><span className="stage-badge-dot" /> {label(row.priority)}</span></td>
                    <td><span className={statusTone(row.status)}><span className="stage-badge-dot" /> {label(row.status)}</span></td>
                    <td>{dateOnly(row.dueAt)}</td>
                    <td style={{ minWidth: 220, maxWidth: 330 }}>
                      {row.response ? (
                        <>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{row.response}</div>
                          <div className="muted" style={{ marginTop: 6 }}>
                            {row.respondedAt ? `Answered ${dateTime(row.respondedAt)}` : 'Response recorded'}
                            {row.respondedBy ? ` by ${row.respondedBy}` : ''}
                          </div>
                        </>
                      ) : <span className="muted">Awaiting response</span>}
                      {row.closedAt ? (
                        <div className="muted" style={{ marginTop: 6 }}>Closed {dateTime(row.closedAt)}</div>
                      ) : null}
                    </td>
                    {canManage ? <td><TransitionControl projectId={projectId} row={row} /></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(hasPrevious || hasNext) ? (
          <nav aria-label="Project RFI pages" style={{ display: 'flex', justifyContent: 'space-between', padding: 14 }}>
            {hasPrevious ? (
              <a className="button-secondary" href={projectRfiHref(projectId, { status: activeStatus, priority: activePriority, page: result.page - 1, limit: result.limit })}>
                Previous
              </a>
            ) : <span />}
            {hasNext ? (
              <a className="button-secondary" href={projectRfiHref(projectId, { status: activeStatus, priority: activePriority, page: result.page + 1, limit: result.limit })}>
                Next
              </a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  )
}
