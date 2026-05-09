'use client'

import { useTransition, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { addBomLineItem, deleteBomLineItem, approveBom, createBom } from '@/app/(dashboard)/projects/[id]/bom/actions'
import { createPoFromBom, createInvoice } from '@/app/(dashboard)/procurement/actions'

interface BomLineItem {
  id: string
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_cents: number
  markup_bps: number
  line_total_cents: number
}

interface Bom {
  id: string
  version: number
  label: string | null
  status: 'draft' | 'approved' | 'locked' | 'archived'
  total_cost_cents: number
  tcv_cents: number
  gp_cents: number
  gp_margin_bps: number
  lineItems: BomLineItem[]
}

interface BomBuilderProps {
  projectId: string
  bom: Bom | null
}

function formatPHP(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  approved: '#10b981',
  locked: '#3b82f6',
  archived: '#6b7280',
}

export function BomBuilder({ projectId, bom }: BomBuilderProps) {
  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    code: '',
    description: '',
    unit: 'pc',
    quantity: '1',
    unit_cost: '',
    markup: '30',
  })
  const [formError, setFormError] = useState('')
  const router = useRouter()
  const [showPoForm, setShowPoForm] = useState(false)
  const [poForm, setPoForm] = useState({ deliveryDate: '' })
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ billingPercent: '30', dueDate: '' })
  const [procurementError, setProcurementError] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<{ description: string; unit_cost_cents: number; markup_bps: number; unit: string | null; score: number }[]>([])
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)

  const fetchSuggestions = useCallback(async (description: string) => {
    if (!description.trim() || description.length < 5) {
      setAiSuggestions([])
      return
    }
    setIsFetchingSuggestions(true)
    try {
      const res = await fetch('/api/ai/similar-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      if (res.ok) {
        const data = await res.json() as { items: typeof aiSuggestions }
        setAiSuggestions(data.items ?? [])
      }
    } catch {
      // AI suggestions are non-critical; silently skip on error
    } finally {
      setIsFetchingSuggestions(false)
    }
  }, [])

  useEffect(() => {
    if (!showAddForm) {
      setAiSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      void fetchSuggestions(form.description)
    }, 600)
    return () => clearTimeout(timer)
  }, [form.description, showAddForm, fetchSuggestions])

  function handleCreate() {
    startTransition(async () => {
      await createBom(projectId)
    })
  }

  function handleApprove() {
    if (!bom) return
    startTransition(async () => {
      await approveBom(bom.id, projectId)
    })
  }

  function handleDelete(itemId: string) {
    if (!bom) return
    startTransition(async () => {
      await deleteBomLineItem(itemId, bom.id, projectId)
    })
  }

  async function handleGeneratePO(e: React.FormEvent) {
    e.preventDefault()
    if (!bom) return
    setProcurementError('')
    startTransition(async () => {
      const result = await createPoFromBom(bom.id, projectId, null, poForm.deliveryDate || null)
      if ('error' in result) {
        setProcurementError(result.error)
      } else {
        router.push(`/purchase-orders/${result.id}`)
      }
    })
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!bom) return
    setProcurementError('')
    const billingPercent = parseFloat(invoiceForm.billingPercent)
    if (isNaN(billingPercent) || billingPercent <= 0 || billingPercent > 100) {
      setProcurementError('Billing % must be between 1 and 100')
      return
    }
    const billingPercentBps = Math.round(billingPercent * 100)
    startTransition(async () => {
      const result = await createInvoice(projectId, bom.id, billingPercentBps, invoiceForm.dueDate || null)
      if ('error' in result) {
        setProcurementError(result.error)
      } else {
        router.push(`/invoices/${result.id}`)
      }
    })
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault()
    if (!bom) return
    setFormError('')

    const unitCostCents = Math.round(parseFloat(form.unit_cost) * 100)
    const quantity = parseInt(form.quantity, 10)
    const markupBps = Math.round(parseFloat(form.markup) * 100)

    if (!form.description.trim()) return setFormError('Description is required')
    if (isNaN(unitCostCents) || unitCostCents < 0) return setFormError('Invalid unit cost')
    if (isNaN(quantity) || quantity < 1) return setFormError('Quantity must be at least 1')

    startTransition(async () => {
      const result = await addBomLineItem(bom.id, projectId, {
        description: form.description,
        unit: form.unit,
        quantity,
        unit_cost_cents: unitCostCents,
        markup_bps: markupBps,
        code: form.code || undefined,
      })
      if (!result.error) {
        setForm({ code: '', description: '', unit: 'pc', quantity: '1', unit_cost: '', markup: '30' })
        setShowAddForm(false)
      } else {
        setFormError(result.error)
      }
    })
  }

  if (!bom) {
    return (
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '64px 24px',
          textAlign: 'center',
          color: 'var(--color-neutral-400)',
        }}
      >
        <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>No BOM yet for this project.</p>
        <button
          onClick={handleCreate}
          disabled={isPending}
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 20px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Creating…' : 'Create BOM v1'}
        </button>
      </div>
    )
  }

  const isEditable = bom.status === 'draft'

  return (
    <div>
      {/* BOM header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-700)' }}>
            {bom.label ?? `BOM v${bom.version}`}
          </span>
          <span
            className="stage-badge"
            style={{
              color: STATUS_COLORS[bom.status],
              background: STATUS_COLORS[bom.status] + '18',
            }}
          >
            {bom.status.charAt(0).toUpperCase() + bom.status.slice(1)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isEditable && (
            <>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                style={{
                  background: 'white',
                  color: 'var(--color-navy-700)',
                  border: '1px solid var(--color-navy-700)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add Line
              </button>
              <button
                onClick={handleApprove}
                disabled={isPending || bom.lineItems.length === 0}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: isPending || bom.lineItems.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: isPending || bom.lineItems.length === 0 ? 0.6 : 1,
                }}
              >
                Approve BOM
              </button>
            </>
          )}
          {!isEditable && bom.status !== 'archived' && (
            <>
              <button
                onClick={() => { setShowPoForm((v) => !v); setShowInvoiceForm(false); setProcurementError('') }}
                style={{
                  background: 'white',
                  color: 'var(--color-navy-700)',
                  border: '1px solid var(--color-navy-700)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Generate PO
              </button>
              <button
                onClick={() => { setShowInvoiceForm((v) => !v); setShowPoForm(false); setProcurementError('') }}
                style={{
                  background: 'var(--color-navy-700)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Create Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {/* Totals strip */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Cost', value: formatPHP(bom.total_cost_cents) },
          { label: 'TCV', value: formatPHP(bom.tcv_cents) },
          { label: 'GP', value: formatPHP(bom.gp_cents), color: bom.gp_cents >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Margin', value: (bom.gp_margin_bps / 100).toFixed(1) + '%' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '10px 16px',
              minWidth: '130px',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: color ?? 'var(--color-neutral-900)', fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Add line form */}
      {showAddForm && isEditable && (
        <form
          onSubmit={handleAddLine}
          style={{
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'grid',
            gridTemplateColumns: '80px 1fr 80px 80px 130px 90px',
            gap: '8px',
            alignItems: 'end',
          }}
        >
          {[
            { label: 'Code', key: 'code', placeholder: 'M-001', type: 'text' },
            { label: 'Description *', key: 'description', placeholder: 'Fan Coil Unit, 1.5TR', type: 'text' },
            { label: 'Unit', key: 'unit', placeholder: 'pc', type: 'text' },
            { label: 'Qty *', key: 'quantity', placeholder: '1', type: 'number' },
            { label: 'Unit Cost (₱) *', key: 'unit_cost', placeholder: '0.00', type: 'number' },
            { label: 'Markup %', key: 'markup', placeholder: '30', type: 'number' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
              </label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                min={type === 'number' ? '0' : undefined}
                step={key === 'unit_cost' ? '0.01' : undefined}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  fontFamily: type === 'number' ? 'var(--font-mono)' : undefined,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* AI Suggestions */}
          {(aiSuggestions.length > 0 || isFetchingSuggestions) && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>AI Suggestions</span>
                {isFetchingSuggestions && <span style={{ color: 'var(--color-navy-700)', fontStyle: 'italic', fontWeight: 400, textTransform: 'none' }}>searching…</span>}
              </div>
              {aiSuggestions.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 8px',
                    background: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span style={{ flex: 1, color: 'var(--color-neutral-700)' }}>{s.description}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-500)', fontSize: '0.75rem' }}>
                    {s.unit ?? ''} · {formatPHP(s.unit_cost_cents)} · {(s.markup_bps / 100).toFixed(0)}%
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>{s.score}%</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      description: s.description,
                      unit: s.unit ?? f.unit,
                      unit_cost: (s.unit_cost_cents / 100).toFixed(2),
                      markup: (s.markup_bps / 100).toFixed(0),
                    }))}
                    style={{
                      background: 'var(--color-navy-700)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
            {formError && <span style={{ fontSize: '0.8rem', color: '#ef4444', marginRight: 'auto' }}>{formError}</span>}
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setFormError('') }}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-neutral-600)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? 'Adding…' : 'Add Line'}
            </button>
          </div>
        </form>
      )}

      {/* Generate PO form */}
      {showPoForm && !isEditable && bom.status !== 'archived' && (
        <form
          onSubmit={handleGeneratePO}
          style={{
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Delivery Date (optional)
            </label>
            <input
              type="date"
              value={poForm.deliveryDate}
              onChange={(e) => setPoForm({ deliveryDate: e.target.value })}
              style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.8125rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {procurementError && <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>{procurementError}</span>}
            <button
              type="button"
              onClick={() => { setShowPoForm(false); setProcurementError('') }}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-neutral-600)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? 'Creating PO…' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      )}

      {/* Create invoice form */}
      {showInvoiceForm && !isEditable && bom.status !== 'archived' && (
        <form
          onSubmit={handleCreateInvoice}
          style={{
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Billing % *
            </label>
            <input
              type="number"
              min="1"
              max="100"
              step="0.01"
              placeholder="30"
              value={invoiceForm.billingPercent}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, billingPercent: e.target.value }))}
              style={{ width: '90px', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Due Date (optional)
            </label>
            <input
              type="date"
              value={invoiceForm.dueDate}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))}
              style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.8125rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {procurementError && <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>{procurementError}</span>}
            <button
              type="button"
              onClick={() => { setShowInvoiceForm(false); setProcurementError('') }}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-neutral-600)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </form>
      )}

      {/* Line items table */}
      {bom.lineItems.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '32px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
          }}
        >
          No line items yet. {isEditable && 'Click "Add Line" to begin building the BOM.'}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="numeric">Unit</th>
                <th className="numeric">Qty</th>
                <th className="numeric">Unit Cost</th>
                <th className="numeric">Markup</th>
                <th className="numeric">Line Total</th>
                {isEditable && <th style={{ width: '40px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {bom.lineItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>
                    {item.code ?? '—'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--color-neutral-900)' }}>
                    {item.description}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {item.unit ?? '—'}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {item.quantity.toLocaleString()}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatPHP(item.unit_cost_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-neutral-500)' }}>
                    {(item.markup_bps / 100).toFixed(0)}%
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {formatPHP(item.line_total_cents)}
                  </td>
                  {isEditable && (
                    <td>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isPending}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                          color: '#ef4444',
                          fontSize: '0.875rem',
                          padding: '2px 6px',
                          opacity: isPending ? 0.5 : 1,
                        }}
                        aria-label="Delete line item"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                <td colSpan={isEditable ? 6 : 5} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-neutral-600)', padding: '10px 12px', textAlign: 'right' }}>
                  Total
                </td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                  {formatPHP(bom.tcv_cents)}
                </td>
                {isEditable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
