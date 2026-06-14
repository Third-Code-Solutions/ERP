'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCostEntry } from '@/app/(dashboard)/projects/[id]/cost/actions'

export interface CostRow {
  id: string
  description: string
  cost_category: string
  cost_source: string
  reference_number: string | null
  amount_cents: number
  incurred_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  subcontractor: 'Subcontractor',
  equipment: 'Equipment',
  overhead: 'Overhead',
  other: 'Other',
}

function php(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CostTable({
  entries,
  projectId,
  canRecord,
}: {
  entries: CostRow[]
  projectId: string
  canRecord: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function remove(id: string) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await deleteCostEntry(id, projectId)
      setPendingId(null)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  if (entries.length === 0) {
    return (
      <div className="card-empty">
        No cost entries recorded yet. Log the first one to start tracking actuals.
      </div>
    )
  }

  return (
    <>
      {error && (
        <p className="cost-form__error" role="alert" style={{ padding: '8px 16px' }}>
          {error}
        </p>
      )}
      <table className="data-table cost-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Source</th>
            <th>Ref #</th>
            <th className="num">Amount</th>
            {canRecord && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.incurred_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</td>
              <td>{e.description}</td>
              <td>{CATEGORY_LABEL[e.cost_category] ?? e.cost_category}</td>
              <td>
                <span className="cost-source-tag">{e.cost_source === 'po_derived' ? 'PO' : 'Manual'}</span>
              </td>
              <td>{e.reference_number ?? '—'}</td>
              <td className="num mono">{php(e.amount_cents)}</td>
              {canRecord && (
                <td className="num">
                  {e.cost_source === 'po_derived' ? (
                    <span className="cost-locked" title="System-managed">
                      🔒
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="cost-del-btn"
                      onClick={() => remove(e.id)}
                      disabled={pendingId === e.id}
                      aria-label={`Delete ${e.description}`}
                    >
                      {pendingId === e.id ? '…' : '×'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
