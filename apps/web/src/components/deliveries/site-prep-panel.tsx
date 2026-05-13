'use client'

// Site-prep workflow panel. Each status reveals a different action so the
// receiving team only ever sees the one next step. Once delivery is
// received the panel locks down (the inspection panel takes over).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markSitePreparing,
  markSiteReady,
  markInTransit,
  recordReceipt,
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

interface Props {
  scheduleId: string
  status: DeliveryStatus
  sitePreparationNotes: string
}

const TITLE = 'Site preparation & receipt'

export function SitePrepPanel({
  scheduleId,
  status,
  sitePreparationNotes,
}: Props) {
  const [error, setError] = useState('')
  const [prepNotes, setPrepNotes] = useState(sitePreparationNotes)
  const [receiptNotes, setReceiptNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ error?: string }>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
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
        {TITLE}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {status === 'scheduled' ? (
          <>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              Kick off site preparation once the receiving team has been briefed.
            </p>
            <PrimaryButton
              onClick={() => run(() => markSitePreparing(scheduleId))}
              disabled={isPending}
              label="Mark site preparing"
            />
          </>
        ) : null}

        {status === 'site_preparing' ? (
          <>
            <Label>Preparation notes</Label>
            <textarea
              value={prepNotes}
              onChange={(e) => setPrepNotes(e.target.value)}
              rows={3}
              placeholder="Document staging area, lift coordination, security pass-throughs, etc."
              style={textareaStyle}
            />
            <PrimaryButton
              onClick={() =>
                run(() => markSiteReady(scheduleId, prepNotes || undefined))
              }
              disabled={isPending}
              label="Mark site ready"
            />
          </>
        ) : null}

        {status === 'site_ready' ? (
          <>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              Site is prepared. Flag the delivery as in-transit once the supplier
              confirms dispatch.
            </p>
            <PrimaryButton
              onClick={() => run(() => markInTransit(scheduleId))}
              disabled={isPending}
              label="Mark in transit"
            />
          </>
        ) : null}

        {status === 'in_transit' ? (
          <>
            <Label>Receipt notes (optional)</Label>
            <textarea
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              rows={2}
              placeholder="DR / waybill numbers, packaging condition, missing items."
              style={textareaStyle}
            />
            <PrimaryButton
              onClick={() =>
                run(() => recordReceipt(scheduleId, receiptNotes || undefined))
              }
              disabled={isPending}
              label="Record receipt"
            />
          </>
        ) : null}

        {status === 'received' || status === 'inspecting' ? (
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
            Goods are on site. Continue in the inspection panel below.
          </p>
        ) : null}

        {status === 'accepted' ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: 'var(--color-success, #166534)',
              background: '#dcfce7',
              padding: '8px 10px',
              borderRadius: 6,
            }}
          >
            Delivery accepted. Workflow complete.
          </p>
        ) : null}

        {status === 'rejected' ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: '#991b1b',
              background: '#fee2e2',
              padding: '8px 10px',
              borderRadius: 6,
            }}
          >
            Delivery rejected. Coordinate replacement or credit with procurement.
          </p>
        ) : null}

        {status === 'cancelled' ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: 'var(--color-neutral-500)',
            }}
          >
            Delivery cancelled — no further site prep actions available.
          </p>
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

function PrimaryButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        alignSelf: 'flex-start',
        background: 'var(--color-navy-700)',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        padding: '9px 16px',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {label}
    </button>
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
