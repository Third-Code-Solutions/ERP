'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  recordMobilizationInput,
  startMobilization,
} from './actions'

type InputKey =
  | 'commented_fcd_received_at'
  | 'po_copies_received_at'
  | 'cari_received_at'
  | 'ntp_received_at'

interface MobilizationReadinessPanelProps {
  projectId: string
  readiness: {
    commentedFcdReceivedAt: string | null
    poCopiesReceivedAt: string | null
    cariReceivedAt: string | null
    ntpReceivedAt: string | null
    startedAt: string | null
    overrideReason: string | null
  } | null
  riskByInput: Record<InputKey, number | null>
}

const INPUTS: Array<{ key: InputKey; label: string; description: string }> = [
  {
    key: 'commented_fcd_received_at',
    label: 'Commented FCD',
    description: 'Commented-for-construction drawing set returned.',
  },
  {
    key: 'po_copies_received_at',
    label: 'PO copies',
    description: 'Issued purchase-order copies available to the site team.',
  },
  {
    key: 'cari_received_at',
    label: 'CARI',
    description: 'Construction-related insurance return received.',
  },
  {
    key: 'ntp_received_at',
    label: 'NTP from Building Admin',
    description: 'Notice to proceed / building-admin release received.',
  },
]

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

function inputValue(
  readiness: MobilizationReadinessPanelProps['readiness'],
  key: InputKey
): string {
  if (!readiness) return ''
  const values: Record<InputKey, string | null> = {
    commented_fcd_received_at: readiness.commentedFcdReceivedAt,
    po_copies_received_at: readiness.poCopiesReceivedAt,
    cari_received_at: readiness.cariReceivedAt,
    ntp_received_at: readiness.ntpReceivedAt,
  }
  return toDateInput(values[key])
}

function riskLabel(daysAtRisk: number | null): string {
  if (daysAtRisk === null) return 'No forecast'
  if (daysAtRisk > 0) return `${daysAtRisk}d overdue`
  return '0d at risk'
}

export function MobilizationReadinessPanel({
  projectId,
  readiness,
  riskByInput,
}: MobilizationReadinessPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dates, setDates] = useState<Record<InputKey, string>>(() =>
    Object.fromEntries(INPUTS.map(({ key }) => [key, inputValue(readiness, key)])) as Record<
      InputKey,
      string
    >
  )
  const [overrideReason, setOverrideReason] = useState(readiness?.overrideReason ?? '')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const receivedCount = INPUTS.filter(({ key }) => Boolean(dates[key])).length
  const complete = receivedCount === INPUTS.length
  const started = Boolean(readiness?.startedAt)

  const saveInput = (key: InputKey) => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await recordMobilizationInput(projectId, key, dates[key] || undefined)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage('Return recorded.')
      router.refresh()
    })
  }

  const handleStart = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await startMobilization(projectId, overrideReason)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(result.startedAt ? 'Mobilization marked started.' : 'Mobilization is already started.')
      router.refresh()
    })
  }

  return (
    <section
      aria-labelledby="mobilization-readiness-heading"
      style={{
        background: 'var(--color-navy-950, #071827)',
        borderRadius: '10px',
        color: 'white',
        marginBottom: '16px',
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', fontSize: '0.72rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Mobilization gate
          </p>
          <h2 id="mobilization-readiness-heading" style={{ margin: '5px 0 4px', fontSize: '1.1rem' }}>
            Four returns before site start
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', fontSize: '0.82rem', maxWidth: '620px' }}>
            Record the evidence date for every return. The server and database reject a start with a missing return unless an authorized override is reasoned and audited.
          </p>
        </div>
        <div
          aria-live="polite"
          style={{
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: '999px',
            color: complete || started ? '#b9f6d0' : '#fde68a',
            fontSize: '0.76rem',
            padding: '7px 11px',
            whiteSpace: 'nowrap',
          }}
        >
          {started ? 'Started' : `${receivedCount}/4 returns received`}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '18px' }}>
        {INPUTS.map(({ key, label, description }) => {
          const value = dates[key]
          const risk = riskByInput[key]
          return (
            <div key={key} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: '8px', padding: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.87rem' }}>{label}</strong>
                <span style={{ color: risk !== null && risk > 0 ? '#fca5a5' : 'rgba(255,255,255,.58)', fontSize: '0.68rem' }}>
                  {riskLabel(risk)}
                </span>
              </div>
              <p style={{ color: 'rgba(255,255,255,.58)', fontSize: '0.74rem', lineHeight: 1.45, margin: '5px 0 10px', minHeight: '32px' }}>
                {description}
              </p>
              <div style={{ display: 'flex', gap: '7px' }}>
                <input
                  aria-label={`${label} received date`}
                  type="date"
                  value={value}
                  disabled={pending || started}
                  onChange={(event) => setDates((current) => ({ ...current, [key]: event.target.value }))}
                  style={{ background: 'white', border: 0, borderRadius: '5px', color: '#102538', minWidth: 0, padding: '7px 8px', width: '100%' }}
                />
                <button
                  type="button"
                  disabled={pending || started || !value}
                  onClick={() => saveInput(key)}
                  style={{ background: value ? '#d8f6e4' : 'rgba(255,255,255,.12)', border: 0, borderRadius: '5px', color: '#102538', cursor: pending || started || !value ? 'not-allowed' : 'pointer', fontSize: '0.74rem', fontWeight: 700, padding: '0 10px', whiteSpace: 'nowrap' }}
                >
                  Save
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!complete && !started && (
        <label style={{ display: 'block', marginTop: '16px' }}>
          <span style={{ color: 'rgba(255,255,255,.78)', display: 'block', fontSize: '0.77rem', fontWeight: 600, marginBottom: '5px' }}>
            Override reason (required if any return is missing)
          </span>
          <textarea
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            rows={2}
            placeholder="Name the missing return, risk owner, and mitigation."
            style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: '5px', boxSizing: 'border-box', fontFamily: 'inherit', padding: '8px', resize: 'vertical', width: '100%' }}
          />
        </label>
      )}

      {(error || message) && (
        <p role={error ? 'alert' : 'status'} style={{ color: error ? '#fecaca' : '#b9f6d0', fontSize: '0.8rem', margin: '13px 0 0' }}>
          {error ?? message}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          type="button"
          disabled={pending || started || (!complete && !overrideReason.trim())}
          onClick={handleStart}
          style={{ background: complete || overrideReason.trim() ? '#d8f6e4' : 'rgba(255,255,255,.12)', border: 0, borderRadius: '6px', color: '#102538', cursor: pending || started || (!complete && !overrideReason.trim()) ? 'not-allowed' : 'pointer', fontWeight: 700, padding: '9px 14px' }}
        >
          {started ? 'Mobilization started' : pending ? 'Saving…' : complete ? 'Mark mobilization started' : 'Start with authorized override'}
        </button>
      </div>
    </section>
  )
}
