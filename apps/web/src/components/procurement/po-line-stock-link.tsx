'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { linkPoLineToItem } from '@/app/(dashboard)/purchase-orders/[id]/actions'

export interface StockItemOption {
  id: string
  code: string
  description: string
  unit: string
}

const smallButton: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 5,
  background: 'var(--color-surface)',
  fontSize: '0.75rem',
  cursor: 'pointer',
}

/**
 * Stock item of a Purchase Order line. A line receives into stock only when it
 * is linked to an active tracked item in that item's unit; the reason it is not
 * ready is shown, and a buyer with inventory.manage can fix the link here.
 */
export function PoLineStockLink({
  lineId,
  itemCode,
  unitCode,
  reason,
  editable,
  canCreateFromLine,
  items,
}: {
  lineId: string
  itemCode: string | null
  unitCode: string | null
  /** Why the line cannot be received; null when it can. */
  reason: string | null
  editable: boolean
  canCreateFromLine: boolean
  items: StockItemOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(input: Parameters<typeof linkPoLineToItem>[0]) {
    setError(null)
    startTransition(async () => {
      const result = await linkPoLineToItem(input)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (!reason) {
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
        Stock item {itemCode} · {unitCode}
      </span>
    )
  }

  return (
    <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
      <span>Stock item: not ready. {reason}</span>
      {editable && !open && (
        <button
          type="button"
          style={{ ...smallButton, marginLeft: 6 }}
          onClick={() => setOpen(true)}
        >
          Link
        </button>
      )}
      {editable && open && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <select
            aria-label="Stock item"
            value={itemId}
            disabled={pending}
            onChange={(event) => setItemId(event.target.value)}
            style={{ ...smallButton, maxWidth: 220 }}
          >
            <option value="">Choose a tracked item</option>
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.code} · {item.description} ({item.unit})
              </option>
            ))}
          </select>
          <button
            type="button"
            style={smallButton}
            disabled={pending || !itemId}
            onClick={() =>
              run({ lineId, mode: 'existing', materialItemId: itemId })
            }
          >
            {pending ? 'Saving...' : 'Link item'}
          </button>
          {canCreateFromLine && (
            <button
              type="button"
              style={smallButton}
              disabled={pending}
              onClick={() => run({ lineId, mode: 'create' })}
            >
              Create tracked item from this line
            </button>
          )}
          <button
            type="button"
            style={smallButton}
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <span
          role="alert"
          style={{ display: 'block', color: 'var(--color-danger)', marginTop: 4 }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
