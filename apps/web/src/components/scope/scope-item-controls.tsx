'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addScopeItem, deleteScopeItem, updateScopeItemCost } from '@/app/(dashboard)/projects/[id]/scope/actions'

const UNIT_OPTIONS = [
  { value: 'pc', label: 'pc' },
  { value: 'set', label: 'set' },
  { value: 'lot', label: 'lot' },
  { value: 'sqm', label: 'm²' },
  { value: 'lm', label: 'lm' },
  { value: 'unit', label: 'unit' },
  { value: 'kg', label: 'kg' },
  { value: 'bag', label: 'bag' },
  { value: 'box', label: 'box' },
]

export function AddScopeItemForm({ projectId }: { projectId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await addScopeItem(projectId, data)
      if (result.error) {
        setError(result.error)
      } else {
        ;(e.target as HTMLFormElement).reset()
        setIsOpen(false)
        router.refresh()
      }
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '7px 14px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + Add Item
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          borderRadius: '10px',
          padding: '24px',
          width: '480px',
          maxWidth: '95vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-neutral-900)' }}>
          Add Scope Item
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input name="code" placeholder="FCU-01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description *</label>
              <input name="description" required placeholder="Fan Coil Unit, 2.5TR" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Unit</label>
              <select name="unit" defaultValue="pc" style={inputStyle}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Quantity *</label>
              <input type="number" name="quantity" required min="1" defaultValue="1" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Unit Cost (₱)</label>
              <input type="number" name="unit_cost" min="0" step="0.01" placeholder="0.00" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <input name="notes" placeholder="Optional" style={inputStyle} />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '12px 0 0' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '0.8125rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Adding…' : 'Add Item'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DeleteScopeItemButton({ projectId, itemId }: { projectId: string; itemId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm('Remove this scope item?')) return
    startTransition(async () => {
      await deleteScopeItem(itemId, projectId)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      title="Remove item"
      style={{
        background: 'none',
        border: 'none',
        cursor: isPending ? 'not-allowed' : 'pointer',
        color: '#ef4444',
        opacity: isPending ? 0.5 : 0.6,
        fontSize: '0.875rem',
        padding: '2px 6px',
        borderRadius: '3px',
        lineHeight: 1,
      }}
    >
      ×
    </button>
  )
}

export function EditableUnitCost({
  projectId,
  itemId,
  unitCostCents,
}: {
  projectId: string
  itemId: string
  unitCostCents: number
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(unitCostCents > 0 ? (unitCostCents / 100).toFixed(2) : '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleCommit() {
    const parsed = parseFloat(value)
    const cents = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100)
    setEditing(false)
    if (cents === unitCostCents) return
    startTransition(async () => {
      await updateScopeItemCost(itemId, projectId, cents)
      router.refresh()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleCommit()
    if (e.key === 'Escape') {
      setValue(unitCostCents > 0 ? (unitCostCents / 100).toFixed(2) : '')
      setEditing(false)
    }
  }

  const displayValue =
    unitCostCents > 0
      ? `₱${(unitCostCents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—'

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', marginRight: '2px' }}>₱</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          style={{
            width: '100px',
            padding: '3px 6px',
            border: '1px solid var(--color-navy-700)',
            borderRadius: '4px',
            fontSize: '0.8125rem',
            fontFamily: 'JetBrains Mono, monospace',
            textAlign: 'right',
            outline: 'none',
          }}
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={isPending}
      title="Click to edit unit cost"
      style={{
        background: 'none',
        border: 'none',
        padding: '2px 4px',
        borderRadius: '3px',
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.8125rem',
        color: unitCostCents > 0 ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)',
        opacity: isPending ? 0.5 : 1,
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '3px',
      }}
    >
      {isPending ? '…' : displayValue}
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--color-neutral-500)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
