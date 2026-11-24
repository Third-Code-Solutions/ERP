'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordSupplierConfirmation } from '@/app/(dashboard)/purchase-orders/[id]/actions'
import {
  SUPPLIER_CONFIRMATION_CHANNELS,
  SUPPLIER_CONFIRMATION_CHANNEL_LABELS,
  type SupplierConfirmationChannel,
} from '@/lib/procurement/supplier-confirmation'

export interface RecordedSupplierConfirmation {
  /** Calendar date (YYYY-MM-DD, Manila) the supplier confirmed. */
  date: string
  byName: string
  channel: SupplierConfirmationChannel
  note: string | null
}

const fieldStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: '0.8125rem',
  background: 'var(--color-surface)',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
}

/** Whether, how and when the supplier confirmed the issued PO, recorded by Procurement. */
export function SupplierConfirmation({
  poId,
  recorded,
  canRecord,
  today,
}: {
  poId: string
  recorded: RecordedSupplierConfirmation | null
  canRecord: boolean
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<SupplierConfirmationChannel>(
    recorded?.channel ?? 'email'
  )
  const [byName, setByName] = useState(recorded?.byName ?? '')
  const [confirmedOn, setConfirmedOn] = useState(recorded?.date ?? today)
  const [note, setNote] = useState(recorded?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await recordSupplierConfirmation({
        poId,
        channel,
        confirmedByName: byName,
        confirmedOn,
        note,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <h3
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: '0 0 12px',
        }}
      >
        Supplier confirmation
      </h3>
      {recorded ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-800)' }}>
          Confirmed by {recorded.byName} on {recorded.date} (
          {SUPPLIER_CONFIRMATION_CHANNEL_LABELS[recorded.channel].toLowerCase()})
          {recorded.note ? `: ${recorded.note}` : ''}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
          The supplier has not confirmed this Purchase Order yet. When they confirm by
          email or phone, record it here.
        </p>
      )}
      {canRecord && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ ...fieldStyle, marginTop: 12, cursor: 'pointer', fontWeight: 600 }}
        >
          {recorded ? 'Change confirmation' : 'Record supplier confirmation'}
        </button>
      )}
      {canRecord && open && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 12,
          }}
        >
          <label style={labelStyle}>
            How the supplier confirmed
            <select
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as SupplierConfirmationChannel)
              }
              style={fieldStyle}
            >
              {SUPPLIER_CONFIRMATION_CHANNELS.map((value) => (
                <option value={value} key={value}>
                  {SUPPLIER_CONFIRMATION_CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Date confirmed
            <input
              type="date"
              value={confirmedOn}
              max={today}
              onChange={(event) => setConfirmedOn(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            Who at the supplier confirmed
            <input
              value={byName}
              maxLength={255}
              onChange={(event) => setByName(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            Note (optional)
            <textarea
              value={note}
              maxLength={2000}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <div
            style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <button
              type="button"
              disabled={pending}
              onClick={save}
              style={{ ...fieldStyle, cursor: 'pointer', fontWeight: 600 }}
            >
              {pending ? 'Saving...' : 'Save confirmation'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              Cancel
            </button>
            {error && (
              <span role="alert" style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
