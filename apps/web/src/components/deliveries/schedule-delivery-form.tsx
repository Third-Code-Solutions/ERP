'use client'

// Schedule-delivery form. We collect just enough to make the receiving
// crew functional: PO, when the truck arrives, where to send it, who's
// taking delivery, and any prep notes. Everything else flows from the
// status workflow on the detail page.

import { useState, useTransition } from 'react'
import { scheduleDelivery } from '@/app/(dashboard)/procurement/deliveries/actions'

interface PoOption {
  id: string
  label: string
}

interface Props {
  purchaseOrders: PoOption[]
  defaultPurchaseOrderId?: string
}

export function ScheduleDeliveryForm({
  purchaseOrders,
  defaultPurchaseOrderId,
}: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await scheduleDelivery(data)
      if (result?.error) setError(result.error)
      // Success path triggers a redirect server-side; no client refresh
      // required because the redirect throws past us.
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '0.875rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'white',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-neutral-600)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 24,
        display: 'grid',
        gap: 16,
        maxWidth: 720,
      }}
    >
      <div>
        <label style={labelStyle}>Purchase order</label>
        <select
          name="purchase_order_id"
          required
          defaultValue={defaultPurchaseOrderId ?? ''}
          style={inputStyle}
        >
          <option value="">Select an issued PO…</option>
          {purchaseOrders.map((po) => (
            <option key={po.id} value={po.id}>
              {po.label}
            </option>
          ))}
        </select>
        {purchaseOrders.length === 0 ? (
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-warning)',
              margin: '6px 0 0',
            }}
          >
            No issued POs available. Approve and issue a PO before scheduling its
            delivery.
          </p>
        ) : null}
      </div>

      <div>
        <label style={labelStyle}>Scheduled date</label>
        <input
          name="scheduled_date"
          type="datetime-local"
          required
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Site address</label>
        <textarea
          name="site_address"
          required
          rows={2}
          placeholder="Building / floor / room / landmarks"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Site contact name</label>
          <input name="site_contact_name" type="text" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Site contact phone</label>
          <input
            name="site_contact_phone"
            type="tel"
            required
            placeholder="+63 9xx xxx xxxx"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Site preparation notes</label>
        <textarea
          name="site_preparation_notes"
          rows={3}
          placeholder="e.g. Clear 6F freight elevator from 8AM–10AM. Coordinate with building admin."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {error ? (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '10px 12px',
            borderRadius: 6,
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={isPending || purchaseOrders.length === 0}
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '9px 18px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending || purchaseOrders.length === 0 ? 0.7 : 1,
          }}
        >
          {isPending ? 'Scheduling…' : 'Schedule delivery'}
        </button>
      </div>
    </form>
  )
}
