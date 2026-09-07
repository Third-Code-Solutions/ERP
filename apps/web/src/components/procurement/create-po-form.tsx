'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStandalonePo } from '@/app/(dashboard)/procurement/actions'

interface Project {
  id: string
  name: string
}

interface Vendor {
  id: string
  name: string
}

interface LineItem {
  id: number
  code: string
  description: string
  unit: string
  quantity: string
  unit_cost: string
  cost_code_id: string
}

interface CostCode {
  id: string
  code: string
  name: string
}

interface CreatePoFormProps {
  projects: Project[]
  vendors: Vendor[]
  costCodes: CostCode[]
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

let lineCounter = 0

function emptyLine(costCodeId: string): LineItem {
  return {
    id: ++lineCounter,
    code: '',
    description: '',
    unit: 'pc',
    quantity: '1',
    unit_cost: '',
    cost_code_id: costCodeId,
  }
}

export function CreatePoForm({
  projects,
  vendors,
  costCodes,
}: CreatePoFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [lines, setLines] = useState<LineItem[]>([
    emptyLine(costCodes[0]?.id ?? ''),
  ])
  const [error, setError] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreTriggerFocus = useRef(false)
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    if (isOpen) dialog.current?.showModal()
    else if (restoreTriggerFocus.current) {
      trigger.current?.focus()
      restoreTriggerFocus.current = false
    }
  }, [isOpen])

  function openForm() {
    setIdempotencyKey(crypto.randomUUID())
    setIsOpen(true)
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      emptyLine(costCodes[0]?.id ?? ''),
    ])
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function updateLine(id: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  const subtotal = lines.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0
    const cost = parseFloat(l.unit_cost) || 0
    return sum + Math.round(qty * cost * 100)
  }, 0)
  const vat = Math.round(subtotal * 0.12)
  const ewt = Math.round(subtotal * 0.02)
  const total = subtotal + vat - ewt

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)

    const lineItems = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        code: l.code || undefined,
        description: l.description,
        unit: l.unit || undefined,
        quantity: Math.max(1, parseFloat(l.quantity) || 1),
        unit_cost_cents: Math.round((parseFloat(l.unit_cost) || 0) * 100),
        costCodeId: l.cost_code_id,
      }))

    if (lineItems.length === 0) {
      setError('Add at least one line item with a description.')
      return
    }

    formData.set('line_items', JSON.stringify(lineItems))

    startTransition(async () => {
      const result = await createStandalonePo(formData)
      if ('error' in result) {
        setError(result.error)
      } else {
        setIsOpen(false)
        setIdempotencyKey('')
        setLines([emptyLine(costCodes[0]?.id ?? '')])
        router.push(`/purchase-orders/${result.id}`)
      }
    })
  }

  function handleClose() {
    if (isPending) return
    restoreTriggerFocus.current = true
    setIsOpen(false)
    setProjectId('')
    setIdempotencyKey('')
    setError('')
    setLines([emptyLine(costCodes[0]?.id ?? '')])
  }

  if (!isOpen) {
    return (
      <button
        ref={trigger}
        onClick={openForm}
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
        + Create PO
      </button>
    )
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="create-po-title"
      onCancel={(event) => { event.preventDefault(); if (!isPending) handleClose() }}
      style={{ border: 'none', borderRadius: 10, padding: 0, width: 'min(1000px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', margin: 'auto', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', padding: 'clamp(16px, 3vw, 28px)', maxWidth: '100%' }}
      >
        <input type="hidden" name="idempotency_key" value={idempotencyKey} readOnly />
        <h2 id="create-po-title" style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 24px', color: 'var(--color-neutral-900)' }}>
          Create Purchase Order
        </h2>

        {/* Header fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label htmlFor="po-project" style={labelStyle}>Project *</label>
            <select id="po-project" name="project_id" required style={inputStyle} value={projectId} onChange={event => setProjectId(event.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po-vendor" style={labelStyle}>Vendor</label>
            <select id="po-vendor" name="vendor_id" style={inputStyle}>
              <option value="">No vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po-delivery" style={labelStyle}>Expected Delivery</label>
            <input id="po-delivery" type="date" name="delivery_date" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="po-notes" style={labelStyle}>Notes</label>
            <input id="po-notes" name="notes" placeholder="Optional" style={inputStyle} />
          </div>
        </div>

        {costCodes.length === 0 && <div role="status" style={{ marginBottom: 20, lineHeight: 1.6 }}><p>A cost code is required for every PO line. {projectId ? 'Set up cost codes in this project’s Budget Control, then return to create the PO.' : 'Select a project to open its Budget Control setup.'}</p>{projectId && <Link className="button-secondary" href={`/projects/${projectId}/cost/budget`}>Open Budget Control</Link>}</div>}

        {/* Line items */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, margin: 0 }}>Line Items *</label>
            <button
              type="button"
              onClick={addLine}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--color-navy-700)', fontWeight: 500 }}
            >
              + Add row
            </button>
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                  {['Item', 'Description', 'Cost Code', 'Unit', 'Qty', 'Unit Cost (₱)', 'Total', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-500)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const qty = parseFloat(line.quantity) || 0
                  const cost = parseFloat(line.unit_cost) || 0
                  const lineTotal = Math.round(qty * cost * 100)
                  return (
                    <tr key={line.id} style={{ borderBottom: idx < lines.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                      <td style={{ padding: '6px 8px', width: '80px' }}>
                        <input
                          aria-label={`Item code ${idx + 1}`}
                          value={line.code}
                          onChange={(e) => updateLine(line.id, 'code', e.target.value)}
                          placeholder="FCU-01"
                          style={{ ...cellInput, width: '70px' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          aria-label={`Description ${idx + 1}`}
                          required
                          value={line.description}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          placeholder="Description *"
                          style={{ ...cellInput, width: '100%', minWidth: '140px' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', width: '150px' }}>
                        <select
                          aria-label={`Cost code ${idx + 1}`}
                          value={line.cost_code_id}
                          onChange={(e) =>
                            updateLine(line.id, 'cost_code_id', e.target.value)
                          }
                          required
                          style={{ ...cellInput, width: '140px' }}
                        >
                          <option value="">Select code</option>
                          {costCodes.map((costCode) => (
                            <option value={costCode.id} key={costCode.id}>
                              {costCode.code} · {costCode.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', width: '70px' }}>
                        <select
                          aria-label={`Unit ${idx + 1}`}
                          value={line.unit}
                          onChange={(e) => updateLine(line.id, 'unit', e.target.value)}
                          style={{ ...cellInput, width: '60px' }}
                        >
                          {['pc', 'set', 'lot', 'sqm', 'lm', 'unit', 'kg', 'bag', 'box'].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', width: '70px' }}>
                        <input
                          aria-label={`Quantity ${idx + 1}`}
                          type="number"
                          required
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                          style={{ ...cellInput, width: '55px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', width: '110px' }}>
                        <input
                          aria-label={`Unit cost ${idx + 1}`}
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={line.unit_cost}
                          onChange={(e) => updateLine(line.id, 'unit_cost', e.target.value)}
                          placeholder="0.00"
                          style={{ ...cellInput, width: '95px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', width: '100px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-700)', fontSize: '0.8125rem' }}>
                        {lineTotal > 0 ? formatPHP(lineTotal) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', width: '28px' }}>
                        {lines.length > 1 && (
                          <button
                            aria-label={`Remove line ${idx + 1}`}
                            type="button"
                            onClick={() => removeLine(line.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', lineHeight: 1, padding: '2px 4px', opacity: 0.6 }}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals preview */}
        {subtotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ background: 'var(--color-neutral-50)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px 16px', minWidth: '240px' }}>
              {[
                { label: 'Subtotal', value: formatPHP(subtotal) },
                { label: 'VAT (12%)', value: `+${formatPHP(vat)}` },
                { label: 'EWT (2%)', value: `−${formatPHP(ewt)}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>{label}</span>
                  <span style={{ fontSize: '0.8125rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-600)' }}>{value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-800)' }}>Total</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-navy-700)' }}>{formatPHP(total)}</span>
              </div>
            </div>
          </div>
        )}

        {error && <p role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={isPending}
            onClick={handleClose}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || costCodes.length === 0}
            style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 18px', fontSize: '0.8125rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending
              ? 'Creating…'
              : costCodes.length === 0
                ? 'Create a Cost Code first'
                : 'Create PO'}
          </button>
        </div>
      </form>
    </dialog>
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

const cellInput: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid var(--color-border)',
  borderRadius: '3px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
