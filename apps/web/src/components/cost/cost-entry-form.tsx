'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCostEntry } from '@/app/(dashboard)/projects/[id]/cost/actions'

const CATEGORIES = [
  { value: 'material', label: 'Material' },
  { value: 'labour', label: 'Labour' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'other', label: 'Other' },
] as const

interface CostCodeOption {
  id: string
  code: string
  name: string
  category: (typeof CATEGORIES)[number]['value']
}

export function CostEntryForm({
  projectId,
  costCodes,
}: {
  projectId: string
  costCodes: CostCodeOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [selectedCodeId, setSelectedCodeId] = useState(
    costCodes[0]?.id ?? ''
  )
  const selectedCode = costCodes.find((code) => code.id === selectedCodeId)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    data.set('project_id', projectId)
    setError(null)
    startTransition(async () => {
      const res = await createCostEntry(data)
      if ('error' in res) {
        setError(res.error)
        return
      }
      form.reset()
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cost-add-btn"
        onClick={() => setOpen(true)}
        disabled={costCodes.length === 0}
        title={
          costCodes.length === 0
            ? 'Create a Cost Code in Budget Control first'
            : undefined
        }
      >
        + Record cost
      </button>
    )
  }

  return (
    <form className="cost-form" onSubmit={onSubmit}>
      <div className="cost-form__grid">
        <label className="cost-field cost-field--wide">
          <span>Description</span>
          <input name="description" required maxLength={500} placeholder="e.g. Site labour — week 12" />
        </label>
        <label className="cost-field cost-field--wide">
          <span>Cost Code</span>
          <select
            name="cost_code_id"
            value={selectedCodeId}
            onChange={(event) => setSelectedCodeId(event.target.value)}
            required
          >
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} · {code.name}
              </option>
            ))}
          </select>
        </label>
        <input
          name="cost_category"
          type="hidden"
          value={selectedCode?.category ?? ''}
        />
        <label className="cost-field">
          <span>Amount (₱)</span>
          <input name="amount_php" type="number" step="0.01" min="0.01" required placeholder="0.00" />
        </label>
        <label className="cost-field">
          <span>Qty</span>
          <input name="quantity" type="number" min="1" defaultValue={1} />
        </label>
        <label className="cost-field">
          <span>Unit</span>
          <input name="unit" maxLength={20} placeholder="lot / pcs / hrs" />
        </label>
        <label className="cost-field">
          <span>Date incurred</span>
          <input name="incurred_at" type="date" />
        </label>
        <label className="cost-field">
          <span>Reference #</span>
          <input name="reference_number" maxLength={100} placeholder="DR / OR no." />
        </label>
      </div>
      {error && (
        <p className="cost-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="cost-form__actions">
        <button type="submit" className="cost-add-btn" disabled={pending}>
          {pending ? 'Saving…' : 'Save cost'}
        </button>
        <button type="button" className="cost-cancel-btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  )
}
