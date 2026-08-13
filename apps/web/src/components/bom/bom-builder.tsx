'use client'

import { Fragment, useTransition, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  addBomLineItem,
  deleteBomLineItem,
  approveBom,
  createBom,
  fetchProjectForecastTcv,
  setBomLineLocation,
  type ProjectLocationOption,
} from '@/app/(dashboard)/projects/[id]/bom/actions'
import { createPoFromBom, createInvoice } from '@/app/(dashboard)/procurement/actions'
import { SupplierSwitcherPanel } from '@/components/bom/supplier-switcher-panel'
import { VarianceBanner } from '@/components/bom/variance-banner'
import { JustificationDialog } from '@/components/bom/justification-dialog'
import { BomLineRow, isLineFlagged, type BomDupaDetail } from '@/components/bom/bom-line-row'
import { groupBomLinesByDivision } from '@/lib/operations/bom-hierarchy'

interface BomLineItem {
  id: string
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_cents: number
  unit_rate_source: 'dupa' | 'manual' | 'client_boq' | string
  line_total_cents: number
  location_id: string | null
  division_id: string | null
  division_label: string | null
  parent_line_item_id: string | null
  kind: 'work_item' | 'material_line' | string
  classification_status: 'classified' | 'review' | string
  item_no: string | null
  notes?: string | null
  dupa?: BomDupaDetail
}

type LineSource =
  | 'dupa'
  | 'client-boq'
  | 'rag'
  | 'catalog'
  | 'ai-estimate'
  | 'shown'
  | 'manual'
  | 'unpriced'
  | 'unknown'

function classifyLineSource(item: BomLineItem): LineSource {
  if (item.unit_rate_source === 'dupa') return 'dupa'
  if (item.unit_rate_source === 'client_boq') return 'client-boq'
  const notes = (item.notes ?? '').trim()
  if (item.unit_cost_cents === 0 || notes.startsWith('No catalog')) return 'unpriced'
  if (notes.startsWith('Cost from RAG')) return 'rag'
  if (
    notes.startsWith('Cost from Catalog') ||
    notes.startsWith('Cost from PH industry catalog')
  )
    return 'catalog'
  if (notes.startsWith('Cost from AI estimate')) return 'ai-estimate'
  if (notes.startsWith('Price from source document')) return 'shown'
  if (notes.startsWith('Manual')) return 'manual'
  return 'unknown'
}

function SourceBadge({ item }: { item: BomLineItem }) {
  const source = classifyLineSource(item)
  const tooltip = (item.notes ?? '').trim() || 'No provenance recorded'

  const config: Record<
    LineSource,
    { label: string; bg: string; fg: string; border: string }
  > = {
    dupa: {
      label: 'DUPA',
      bg: 'var(--color-success-soft)',
      fg: 'var(--color-success)',
      border: 'color-mix(in oklch, var(--color-success) 30%, transparent)',
    },
    'client-boq': {
      label: 'BOQ',
      bg: 'var(--color-info-soft)',
      fg: 'var(--color-info)',
      border: 'color-mix(in oklch, var(--color-info) 30%, transparent)',
    },
    rag: {
      label: 'RAG',
      bg: 'var(--color-success-soft)',
      fg: 'var(--color-success)',
      border: 'color-mix(in oklch, var(--color-success) 22%, transparent)',
    },
    catalog: {
      label: 'CAT',
      bg: 'var(--color-info-soft)',
      fg: 'var(--color-info)',
      border: 'color-mix(in oklch, var(--color-info) 22%, transparent)',
    },
    'ai-estimate': {
      // Orange/amber so estimators immediately see "this needs a vendor quote".
      label: 'AI',
      bg: 'color-mix(in oklch, var(--color-warning) 12%, transparent)',
      fg: 'var(--color-warning)',
      border: 'color-mix(in oklch, var(--color-warning) 35%, transparent)',
    },
    shown: {
      // Price was printed in the uploaded source document — highest confidence.
      label: 'SRC',
      bg: 'var(--color-info-soft)',
      fg: 'var(--color-info)',
      border: 'color-mix(in oklch, var(--color-info) 30%, transparent)',
    },
    manual: {
      label: 'M',
      bg: 'var(--color-neutral-100)',
      fg: 'var(--color-neutral-700)',
      border: 'var(--color-border)',
    },
    unpriced: {
      label: '!',
      bg: 'var(--color-warning-soft)',
      fg: 'var(--color-warning)',
      border: 'color-mix(in oklch, var(--color-warning) 22%, transparent)',
    },
    unknown: {
      label: '—',
      bg: 'var(--color-neutral-100)',
      fg: 'var(--color-neutral-500)',
      border: 'var(--color-border)',
    },
  }

  const { label, bg, fg, border } = config[source]

  return (
    <span
      title={tooltip}
      aria-label={`Pricing source: ${tooltip}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        padding: '1px 6px',
        marginRight: 8,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.03em',
        lineHeight: 1.4,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontFamily: 'var(--font-mono)',
        verticalAlign: 'baseline',
      }}
    >
      {label}
    </span>
  )
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

interface Vendor {
  id: string
  name: string
}

interface BomBuilderProps {
  projectId: string
  bom: Bom | null
  vendors?: Vendor[]
  locations?: ProjectLocationOption[]
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

export function BomBuilder({ projectId, bom, vendors = [], locations = [] }: BomBuilderProps) {
  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    code: '',
    description: '',
    unit: 'pc',
    quantity: '1',
    unit_cost: '',
    location_id: '',
  })
  const [formError, setFormError] = useState('')
  const router = useRouter()
  const [showPoForm, setShowPoForm] = useState(false)
  const [poForm, setPoForm] = useState({ vendorId: '', deliveryDate: '' })
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ billingPercent: '30', dueDate: '' })
  const [procurementError, setProcurementError] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<{
    description: string
    unit_cost_cents: number
    unit: string | null
    score: number
  }[]>([])
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)
  // US-011 — supplier switcher / variance / justification state.
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [forecastTcvCents, setForecastTcvCents] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [justification, setJustification] = useState<{
    lineItemId: string
    fieldChanged: string
    before: unknown
    after: unknown
  } | null>(null)

  // Responsive: side panel becomes a bottom drawer below 900px.
  useEffect(() => {
    function update() {
      setIsMobile(window.innerWidth < 900)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Pull the linked opportunity's forecast TCV for the variance banner.
  useEffect(() => {
    let cancelled = false
    fetchProjectForecastTcv(projectId)
      .then((res) => {
        if (cancelled) return
        setForecastTcvCents(res.tcvCents)
      })
      .catch(() => {
        if (!cancelled) setForecastTcvCents(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const selectedLine = bom?.lineItems.find((l) => l.id === selectedLineId) ?? null
  const hasFlaggedLines = (bom?.lineItems ?? []).some(isLineFlagged)
  const divisionGroups = bom ? groupBomLinesByDivision(bom.lineItems) : []

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

  function handleLocationChange(lineItemId: string, locationId: string | null) {
    if (!bom) return
    startTransition(async () => {
      const result = await setBomLineLocation({
        lineItemId,
        projectId,
        locationId,
      })
      if (result.error) setFormError(result.error)
    })
  }

  async function handleGeneratePO(e: React.FormEvent) {
    e.preventDefault()
    if (!bom) return
    setProcurementError('')
    startTransition(async () => {
      const result = await createPoFromBom(bom.id, projectId, poForm.vendorId || null, poForm.deliveryDate || null)
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
    if (!form.description.trim()) return setFormError('Description is required')
    if (isNaN(unitCostCents) || unitCostCents < 0) return setFormError('Invalid unit cost')
    if (isNaN(quantity) || quantity < 1) return setFormError('Quantity must be at least 1')

    startTransition(async () => {
      const result = await addBomLineItem(bom.id, projectId, {
        description: form.description,
        unit: form.unit,
        quantity,
        unit_cost_cents: unitCostCents,
        code: form.code || undefined,
        locationId: form.location_id || null,
      })
      if (!result.error) {
        setForm({
          code: '',
          description: '',
          unit: 'pc',
          quantity: '1',
          unit_cost: '',
          location_id: '',
        })
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
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
        // On mobile the panel collapses to a bottom drawer, so we stack normally.
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* US-011: forecast vs BOM variance banner */}
      <VarianceBanner bomTcvCents={bom.tcv_cents} forecastTcvCents={forecastTcvCents} />

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
                disabled={isPending || bom.lineItems.length === 0 || hasFlaggedLines}
                title={
                  hasFlaggedLines
                    ? 'Resolve flagged lines (missing unit cost) before submitting for client approval'
                    : undefined
                }
                style={{
                  background: hasFlaggedLines ? 'var(--color-neutral-200)' : '#10b981',
                  color: hasFlaggedLines ? 'var(--color-neutral-500)' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor:
                    isPending || bom.lineItems.length === 0 || hasFlaggedLines
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isPending || bom.lineItems.length === 0 || hasFlaggedLines ? 0.6 : 1,
                }}
              >
                Submit for Client Approval
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
            gridTemplateColumns: '80px minmax(220px, 1fr) 80px 80px 150px 150px',
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

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Location
            </label>
            <select
              value={form.location_id}
              onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
              style={{
                width: '100%',
                minHeight: 31,
                padding: '6px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                background: 'var(--color-surface)',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Unassigned</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

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
                    {s.unit ?? ''} · {formatPHP(s.unit_cost_cents)} · historical rate suggestion
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>{s.score}%</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      description: s.description,
                      unit: s.unit ?? f.unit,
                      unit_cost: (s.unit_cost_cents / 100).toFixed(2),
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
          {vendors.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Vendor (optional)
              </label>
              <select
                value={poForm.vendorId}
                onChange={(e) => setPoForm((p) => ({ ...p, vendorId: e.target.value }))}
                style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.8125rem', minWidth: '160px' }}
              >
                <option value="">— No vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Delivery Date (optional)
            </label>
            <input
              type="date"
              value={poForm.deliveryDate}
              onChange={(e) => setPoForm((p) => ({ ...p, deliveryDate: e.target.value }))}
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
                <th>Vendor</th>
                <th>Location</th>
                <th className="numeric">Unit</th>
                <th className="numeric">Qty</th>
                <th className="numeric">Unit Cost</th>
                <th className="numeric">Line Total</th>
                {isEditable && <th style={{ width: '40px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {divisionGroups.map((group) => (
                <Fragment key={group.key}>
                  <tr data-division-key={group.key} style={{ background: 'var(--color-navy-50)' }}>
                    <td colSpan={isEditable ? 9 : 8} style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          marginRight: 8,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--color-navy-100)',
                          color: 'var(--color-navy-700)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        DIVISION
                      </span>
                      <strong style={{ color: 'var(--color-neutral-900)', fontSize: 12 }}>{group.label}</strong>
                      <span style={{ marginLeft: 8, color: 'var(--color-neutral-500)', fontSize: 11 }}>
                        {group.lines.length} line{group.lines.length === 1 ? '' : 's'}
                      </span>
                    </td>
                  </tr>
                  {group.lines.map((item) => (
                    <BomLineRow
                      key={item.id}
                      item={item}
                      depth={item.parent_line_item_id ? 1 : 0}
                      isSelected={selectedLineId === item.id}
                      isEditable={isEditable}
                      isPending={isPending}
                      onSelect={() => setSelectedLineId(item.id)}
                      onDelete={() => handleDelete(item.id)}
                      onLocationChange={(locationId) => handleLocationChange(item.id, locationId)}
                      locationOptions={locations}
                      sourceBadge={<SourceBadge item={item} />}
                    />
                  ))}
                  <tr data-division-subtotal={group.key} style={{ background: 'var(--color-neutral-50)' }}>
                    <td colSpan={isEditable ? 7 : 6} style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-neutral-500)', fontSize: 11, fontWeight: 600 }}>
                      {group.label} subtotal
                    </td>
                    <td className="numeric" style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-800)' }}>
                      {formatPHP(group.subtotal_cents)}
                    </td>
                    {isEditable && <td />}
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                <td colSpan={isEditable ? 7 : 6} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-neutral-600)', padding: '10px 12px', textAlign: 'right' }}>
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

      {/* US-011 — right-side supplier switcher panel (drawer on mobile) */}
      <SupplierSwitcherPanel
        projectId={projectId}
        selected={
          selectedLine
            ? {
                id: selectedLine.id,
                code: selectedLine.code,
                description: selectedLine.description,
                unit: selectedLine.unit,
                quantity: selectedLine.quantity,
                unit_cost_cents: selectedLine.unit_cost_cents,
                notes: selectedLine.notes ?? null,
              }
            : null
        }
        onClose={() => setSelectedLineId(null)}
      />

      {justification && (
        <JustificationDialog
          lineItemId={justification.lineItemId}
          projectId={projectId}
          fieldChanged={justification.fieldChanged}
          before={justification.before}
          after={justification.after}
          open
          onClose={() => setJustification(null)}
        />
      )}
    </div>
  )
}
