'use client'

// Inspection workflow + history. When delivery hits 'received', a single
// "Start inspection" button is offered. Once an inspection row is started
// (status='inspecting'), the form expands to capture result + notes.
// Completed inspections are listed below so reviewers can see the audit
// of any prior pass/fail decisions on the same shipment.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  startInspection,
  completeInspection,
} from '@/app/(dashboard)/procurement/deliveries/actions'

type DeliveryStatus =
  | 'scheduled'
  | 'site_preparing'
  | 'site_ready'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'accepted'
  | 'rejected'
  | 'cancelled'

type InspectionResult = 'pending' | 'pass' | 'fail' | 'partial_pass'

interface InspectionRow {
  id: string
  inspector: string | null
  started_at: string | null
  completed_at: string | null
  result: InspectionResult
  defect_notes: string | null
  acceptance_notes: string | null
}

interface Props {
  scheduleId: string
  status: DeliveryStatus
  inspections: InspectionRow[]
}

const RESULT_OPTIONS: { value: 'pass' | 'fail' | 'partial_pass'; label: string }[] = [
  { value: 'pass', label: 'Pass — accept delivery' },
  { value: 'partial_pass', label: 'Partial pass — accept with defects' },
  { value: 'fail', label: 'Fail — reject delivery' },
]

const RESULT_COLOR: Record<InspectionResult, string> = {
  pending: 'var(--color-neutral-500)',
  pass: 'var(--color-success, #15803d)',
  partial_pass: 'var(--color-warning)',
  fail: 'var(--color-danger)',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function InspectionPanel({ scheduleId, status, inspections }: Props) {
  const [error, setError] = useState('')
  const [result, setResult] = useState<'pass' | 'fail' | 'partial_pass'>('pass')
  const [defectNotes, setDefectNotes] = useState('')
  const [acceptanceNotes, setAcceptanceNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const inspectionKeyRef = useRef<string | null>(null)

  function doStart() {
    setError('')
    startTransition(async () => {
      const key =
        (inspectionKeyRef.current ??= globalThis.crypto.randomUUID())
      const res = await startInspection(scheduleId, key)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  function doComplete() {
    setError('')
    if (result === 'fail' && !defectNotes.trim()) {
      setError('Defect notes are required when failing an inspection.')
      return
    }
    startTransition(async () => {
      const res = await completeInspection(
        scheduleId,
        result,
        defectNotes.trim() || undefined,
        acceptanceNotes.trim() || undefined
      )
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--color-neutral-900)',
        }}
      >
        Inspection
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {status === 'received' ? (
          <>
            <p
              style={{
                margin: 0,
                fontSize: '0.8125rem',
                color: 'var(--color-neutral-600)',
              }}
            >
              Goods are received. Start the inspection to record condition and
              decide whether to accept or reject the delivery.
            </p>
            <button
              type="button"
              onClick={doStart}
              disabled={isPending}
              style={{
                alignSelf: 'flex-start',
                background: 'var(--color-navy-700)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '9px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Starting…' : 'Start inspection'}
            </button>
          </>
        ) : null}

        {status === 'inspecting' ? (
          <>
            <Label>Result</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {RESULT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="inspection_result"
                    value={opt.value}
                    checked={result === opt.value}
                    onChange={() => setResult(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <Label>
              Defect notes{' '}
              <span style={{ fontWeight: 400, color: 'var(--color-neutral-400)' }}>
                {result === 'fail' ? '(required)' : '(optional)'}
              </span>
            </Label>
            <textarea
              value={defectNotes}
              onChange={(e) => setDefectNotes(e.target.value)}
              rows={3}
              placeholder="e.g. 2 of 6 FCUs dented; missing accessory kit."
              style={textareaStyle}
            />

            <Label>Acceptance notes (optional)</Label>
            <textarea
              value={acceptanceNotes}
              onChange={(e) => setAcceptanceNotes(e.target.value)}
              rows={2}
              placeholder="Conditions of acceptance, items pending replacement, etc."
              style={textareaStyle}
            />

            <button
              type="button"
              onClick={doComplete}
              disabled={isPending}
              style={{
                alignSelf: 'flex-start',
                background:
                  result === 'fail' ? 'var(--color-danger)' : 'var(--color-navy-700)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '9px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Submitting…' : 'Complete inspection'}
            </button>
          </>
        ) : null}

        {inspections.length === 0 && status !== 'received' && status !== 'inspecting' ? (
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
            No inspections recorded yet. The delivery must be received before an
            inspection can begin.
          </p>
        ) : null}

        {inspections.length > 0 ? (
          <div>
            <Label>Inspection history</Label>
            <ul
              style={{
                listStyle: 'none',
                margin: '8px 0 0',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {inspections.map((i) => (
                <li
                  key={i.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    padding: 10,
                    fontSize: '0.8125rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: RESULT_COLOR[i.result] }}>
                      {i.result.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--color-neutral-500)', fontSize: '0.75rem' }}>
                      {fmtDateTime(i.completed_at ?? i.started_at)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--color-neutral-600)', fontSize: '0.75rem' }}>
                    Inspector: {i.inspector ?? '—'}
                  </div>
                  {i.defect_notes ? (
                    <div
                      style={{
                        marginTop: 6,
                        color: 'var(--color-neutral-800)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        Defects:
                      </strong>{' '}
                      {i.defect_notes}
                    </div>
                  ) : null}
                  {i.acceptance_notes ? (
                    <div
                      style={{
                        marginTop: 6,
                        color: 'var(--color-neutral-800)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        Acceptance:
                      </strong>{' '}
                      {i.acceptance_notes}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: '0.75rem',
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'var(--color-neutral-600)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </label>
  )
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '0.875rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'white',
  fontFamily: 'inherit',
  resize: 'vertical',
}
