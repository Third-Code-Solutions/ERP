'use client'

/**
 * Status-action panel for CX ticket detail (REFACTOR.md US-WA-002).
 *
 * Buttons gate themselves by current ticket status. Close requires a service
 * report document id from the project's document list.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  acknowledgeTicket,
  scheduleTicketRepair,
  markTicketInProgress,
  closeTicket,
} from '@/app/(dashboard)/warranty/actions'

interface DocumentChoice {
  id: string
  file_name: string
  document_type: string
}

interface Props {
  ticketId: string
  status: string
  scheduledAt: string | null
  serviceReportDocumentId: string | null
  documents: DocumentChoice[]
}

export function TicketStatusActions({
  ticketId,
  status,
  scheduledAt,
  serviceReportDocumentId,
  documents,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState<string>(
    scheduledAt ? scheduledAt.slice(0, 16) : ''
  )
  const [reportDocId, setReportDocId] = useState<string>(serviceReportDocumentId ?? '')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)

  function run(fn: () => Promise<{ error?: string; ok?: true }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  const isClosed = status === 'closed' || status === 'cancelled'

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Actions</h2>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status === 'open' && (
          <button
            type="button"
            className="ticket-action ticket-action-primary"
            onClick={() => run(() => acknowledgeTicket(ticketId))}
            disabled={isPending}
          >
            Acknowledge ticket
          </button>
        )}

        {(status === 'acknowledged' || status === 'scheduled' || status === 'in_progress') &&
          !showScheduleForm && (
            <button
              type="button"
              className="ticket-action"
              onClick={() => setShowScheduleForm(true)}
              disabled={isPending}
            >
              {status === 'scheduled' ? 'Reschedule repair' : 'Schedule repair'}
            </button>
          )}

        {showScheduleForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
              Proposed date &amp; time
            </label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="ticket-action ticket-action-primary"
                onClick={() => {
                  if (!scheduleDate) {
                    setError('Pick a date/time')
                    return
                  }
                  run(() =>
                    scheduleTicketRepair(ticketId, new Date(scheduleDate).toISOString())
                  )
                  setShowScheduleForm(false)
                }}
                disabled={isPending || !scheduleDate}
                style={{ flex: 1 }}
              >
                Save schedule
              </button>
              <button
                type="button"
                className="ticket-action"
                onClick={() => setShowScheduleForm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {(status === 'scheduled' || status === 'acknowledged') && (
          <button
            type="button"
            className="ticket-action"
            onClick={() => run(() => markTicketInProgress(ticketId))}
            disabled={isPending}
          >
            Mark in-progress
          </button>
        )}

        {!isClosed && !showCloseForm && (
          <button
            type="button"
            className="ticket-action ticket-action-danger"
            onClick={() => setShowCloseForm(true)}
            disabled={isPending}
          >
            Close ticket
          </button>
        )}

        {showCloseForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
              Service report document *
            </label>
            <select
              value={reportDocId}
              onChange={(e) => setReportDocId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select uploaded document…</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name} ({d.document_type})
                </option>
              ))}
            </select>
            {documents.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--color-neutral-600)', margin: 0 }}>
                Upload the service report under project documents first.
              </p>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="ticket-action ticket-action-danger"
                onClick={() => {
                  if (!reportDocId) {
                    setError('Service report document is required')
                    return
                  }
                  run(() => closeTicket(ticketId, reportDocId))
                  setShowCloseForm(false)
                }}
                disabled={isPending || !reportDocId}
                style={{ flex: 1 }}
              >
                Confirm close
              </button>
              <button
                type="button"
                className="ticket-action"
                onClick={() => setShowCloseForm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isClosed && (
          <div style={{ fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
            Ticket is {status}. No further actions available.
          </div>
        )}

        {error && (
          <div
            style={{
              color: 'var(--color-danger, #b42318)',
              fontSize: 12.5,
              padding: '6px 8px',
              background: '#fef3f2',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}
      </div>
      <style>{`
        .ticket-action {
          background: white;
          border: 1px solid #d0d5dd;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: #14213d;
          width: 100%;
          text-align: left;
        }
        .ticket-action:hover:not(:disabled) { background: #f5f6f8; }
        .ticket-action:disabled { opacity: 0.55; cursor: not-allowed; }
        .ticket-action-primary {
          background: #0F2D4A;
          color: white;
          border-color: #0F2D4A;
        }
        .ticket-action-primary:hover:not(:disabled) { background: #11375a; }
        .ticket-action-danger {
          background: #b42318;
          color: white;
          border-color: #b42318;
        }
        .ticket-action-danger:hover:not(:disabled) { background: #c52f24; }
      `}</style>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'white',
}
