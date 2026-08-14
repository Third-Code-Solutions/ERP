'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveProjectBudget,
  createCostCode,
  createProjectBudget,
  rejectProjectBudget,
  reviseProjectBudget,
  saveProjectBudget,
  submitProjectBudget,
} from './actions'
import { parsePesosToCents } from '@/lib/operations/scope-money'

export interface BudgetCodeOption {
  id: string
  code: string
  name: string
  category: string
}

export interface BudgetBomLineOption {
  id: string
  bomId: string
  label: string
}

export interface BudgetDraft {
  id: string
  revision: number
  sourceBomId: string | null
  controlMode: 'monitor' | 'warn' | 'block'
  toleranceBps: number
  currency: string
  effectiveFrom: string
  reason: string
  lines: Array<{
    id: string
    costCodeId: string
    bomLineItemId: string | null
    description: string
    amountCents: number
  }>
}

interface Props {
  projectId: string
  canManage: boolean
  canCommercialApprove: boolean
  canFinanceApprove: boolean
  draft: BudgetDraft | null
  pendingBudget: {
    id: string
    revision: number
    commercialApprovedBy: string | null
    financeApprovedBy: string | null
  } | null
  approvedBudget: { id: string; revision: number } | null
  codes: BudgetCodeOption[]
  sourceBoms: Array<{ id: string; label: string }>
  bomLines: BudgetBomLineOption[]
}

type EditorLine = {
  key: string
  costCodeId: string
  bomLineItemId: string
  description: string
  amountPhp: string
}

const CATEGORIES = [
  ['material', 'Material'],
  ['labour', 'Labour'],
  ['subcontractor', 'Subcontractor'],
  ['equipment', 'Equipment'],
  ['overhead', 'Overhead'],
  ['other', 'Other'],
] as const

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function messageFrom(result: { error?: string }): string | null {
  return result.error ?? null
}

function formatCents(cents: number | bigint): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(cents)
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, '0')
  return `${whole.toLocaleString('en-PH')}.${fraction}`
}

export function BudgetWorkspace({
  projectId,
  canManage,
  canCommercialApprove,
  canFinanceApprove,
  draft,
  pendingBudget,
  approvedBudget,
  codes,
  sourceBoms,
  bomLines,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revisionReason, setRevisionReason] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [selectedSourceBomId, setSelectedSourceBomId] = useState(
    draft?.sourceBomId ?? ''
  )

  const initialLines = useMemo<EditorLine[]>(() => {
    if (draft?.lines.length) {
      return draft.lines.map((line) => ({
        key: line.id,
        costCodeId: line.costCodeId,
        bomLineItemId: line.bomLineItemId ?? '',
        description: line.description,
        amountPhp: formatCents(line.amountCents),
      }))
    }
    return codes[0]
      ? [
          {
            key: crypto.randomUUID(),
            costCodeId: codes[0].id,
            bomLineItemId: '',
            description: codes[0].name,
            amountPhp: '',
          },
        ]
      : []
  }, [codes, draft])
  const [lines, setLines] = useState(initialLines)

  function run(
    action: () => Promise<{ error?: string }>,
    success: string
  ) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      const actionError = messageFrom(result)
      if (actionError) {
        setError(actionError)
        return
      }
      setNotice(success)
      router.refresh()
    })
  }

  function createCodeAction(form: HTMLFormElement) {
    const data = new FormData(form)
    data.set('project_id', projectId)
    run(
      () => createCostCode(data),
      'Cost Code created. It is ready for budget and cost allocation.'
    )
    form.reset()
  }

  function createBudgetAction(form: HTMLFormElement) {
    const data = new FormData(form)
    data.set('project_id', projectId)
    run(
      () => createProjectBudget(data),
      'Draft baseline created. Add controlled budget lines next.'
    )
  }

  function saveDraft(form: HTMLFormElement) {
    if (!draft) return
    const data = new FormData(form)
    data.set('project_id', projectId)
    data.set('budget_id', draft.id)
    data.set(
      'lines',
      JSON.stringify(
        lines.map((line) => ({
          costCodeId: line.costCodeId,
          bomLineItemId: line.bomLineItemId || null,
          description: line.description,
          amountPhp: line.amountPhp,
        }))
      )
    )
    run(() => saveProjectBudget(data), 'Draft baseline saved.')
  }

  function addLine() {
    const unused = codes.find(
      (code) => !lines.some((line) => line.costCodeId === code.id)
    )
    if (!unused) {
      setError('Create another Cost Code before adding a budget line.')
      return
    }
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        costCodeId: unused.id,
        bomLineItemId: '',
        description: unused.name,
        amountPhp: '',
      },
    ])
  }

  const visibleBomLines = bomLines.filter(
    (line) => !selectedSourceBomId || line.bomId === selectedSourceBomId
  )
  const lineTotalCents = lines.reduce((total, line) => {
    const cents = parsePesosToCents(line.amountPhp)
    return cents === undefined ? total : total + BigInt(cents)
  }, 0n)

  return (
    <div className="budget-workspace">
      {(error || notice) && (
        <div
          className={`budget-message ${error ? 'budget-message-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
        </div>
      )}

      {canManage && (
        <details className="budget-panel budget-panel-compact">
          <summary>
            <span>
              <strong>Cost Code library</strong>
              <small>
                Stable classifications shared by budgets, commitments, and
                actuals.
              </small>
            </span>
            <span>{codes.length} active</span>
          </summary>
          <form
            className="budget-inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              createCodeAction(event.currentTarget)
            }}
          >
            <label>
              <span>Code</span>
              <input name="code" required maxLength={40} placeholder="MAT-100" />
            </label>
            <label className="budget-grow">
              <span>Name</span>
              <input
                name="name"
                required
                maxLength={160}
                placeholder="Structural materials"
              />
            </label>
            <label>
              <span>Category</span>
              <select name="category" defaultValue="material">
                {CATEGORIES.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="finance-secondary-button"
              type="submit"
              disabled={pending}
            >
              Add code
            </button>
          </form>
          <div className="budget-code-grid">
            {codes.map((code) => (
              <div key={code.id}>
                <code>{code.code}</code>
                <span>{code.name}</span>
                <small>{code.category}</small>
              </div>
            ))}
          </div>
        </details>
      )}

      {!draft && canManage && !approvedBudget && (
        <section className="budget-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">Controlled baseline</p>
              <h2>Create Project Budget</h2>
            </div>
            <p>
              Start a versioned cost baseline. Approval evidence locks the
              revision.
            </p>
          </div>
          <form
            className="budget-create-grid"
            onSubmit={(event) => {
              event.preventDefault()
              createBudgetAction(event.currentTarget)
            }}
          >
            <label>
              <span>Source BOM</span>
              <select name="source_bom_id" defaultValue="">
                <option value="">No source BOM</option>
                {sourceBoms.map((bom) => (
                  <option key={bom.id} value={bom.id}>
                    {bom.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Control</span>
              <select name="control_mode" defaultValue="warn">
                <option value="monitor">Monitor</option>
                <option value="warn">Warn</option>
                <option value="block">Block overcommit</option>
              </select>
            </label>
            <label>
              <span>Tolerance (basis points)</span>
              <input
                name="tolerance_bps"
                type="number"
                min="0"
                max="10000"
                defaultValue="0"
              />
            </label>
            <label>
              <span>Currency</span>
              <input name="currency" defaultValue="PHP" maxLength={3} required />
            </label>
            <label>
              <span>Effective date</span>
              <input
                name="effective_from"
                type="date"
                defaultValue={today()}
                required
              />
            </label>
            <label className="budget-span-2">
              <span>Revision reason</span>
              <input
                name="revision_reason"
                defaultValue="Initial controlled baseline"
                required
                maxLength={500}
              />
            </label>
            <div className="budget-form-actions">
              <button
                className="finance-primary-button"
                type="submit"
                disabled={pending || codes.length === 0}
              >
                Create draft
              </button>
              {codes.length === 0 && (
                <small>Create at least one Cost Code first.</small>
              )}
            </div>
          </form>
        </section>
      )}

      {draft && canManage && (
        <section className="budget-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">
                Revision {draft.revision} · Draft
              </p>
              <h2>Build the baseline</h2>
            </div>
            <div className="budget-draft-total">
              <span>Draft total</span>
              <strong>
                {draft.currency}{' '}
                {formatCents(lineTotalCents)}
              </strong>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveDraft(event.currentTarget)
            }}
          >
            <div className="budget-create-grid budget-draft-settings">
              <label>
                <span>Source BOM</span>
                <select
                  name="source_bom_id"
                  value={selectedSourceBomId}
                  onChange={(event) => {
                    setSelectedSourceBomId(event.target.value)
                    setLines((current) =>
                      current.map((line) => ({
                        ...line,
                        bomLineItemId: '',
                      }))
                    )
                  }}
                >
                  <option value="">No source BOM</option>
                  {sourceBoms.map((bom) => (
                    <option key={bom.id} value={bom.id}>
                      {bom.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Control</span>
                <select name="control_mode" defaultValue={draft.controlMode}>
                  <option value="monitor">Monitor</option>
                  <option value="warn">Warn</option>
                  <option value="block">Block overcommit</option>
                </select>
              </label>
              <label>
                <span>Tolerance (basis points)</span>
                <input
                  name="tolerance_bps"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue={draft.toleranceBps}
                />
              </label>
              <label>
                <span>Currency</span>
                <input
                  name="currency"
                  defaultValue={draft.currency}
                  maxLength={3}
                  required
                />
              </label>
              <label>
                <span>Effective date</span>
                <input
                  name="effective_from"
                  type="date"
                  defaultValue={draft.effectiveFrom}
                  required
                />
              </label>
              <label className="budget-span-2">
                <span>Revision reason</span>
                <input
                  name="revision_reason"
                  defaultValue={draft.reason}
                  required
                  maxLength={500}
                />
              </label>
            </div>

            <div className="budget-line-shell">
              <div className="budget-line-head">
                <span>Cost Code</span>
                <span>Source evidence</span>
                <span>Description</span>
                <span>Baseline amount</span>
                <span />
              </div>
              {lines.map((line, index) => (
                <div className="budget-line" key={line.key}>
                  <select
                    aria-label={`Cost Code ${index + 1}`}
                    value={line.costCodeId}
                    onChange={(event) => {
                      const selected = codes.find(
                        (code) => code.id === event.target.value
                      )
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? {
                                ...item,
                                costCodeId: event.target.value,
                                description:
                                  item.description || selected?.name || '',
                              }
                            : item
                        )
                      )
                    }}
                    required
                  >
                    {codes.map((code) => (
                      <option value={code.id} key={code.id}>
                        {code.code} · {code.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Source BOM line ${index + 1}`}
                    value={line.bomLineItemId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, bomLineItemId: event.target.value }
                            : item
                        )
                      )
                    }
                  >
                    <option value="">No linked BOM line</option>
                    {visibleBomLines.map((bomLine) => (
                      <option value={bomLine.id} key={bomLine.id}>
                        {bomLine.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Description ${index + 1}`}
                    value={line.description}
                    maxLength={500}
                    required
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, description: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                  <input
                    aria-label={`Baseline amount ${index + 1}`}
                    value={line.amountPhp}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, amountPhp: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className="finance-text-button"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="budget-form-actions budget-form-actions-split">
              <button
                className="finance-secondary-button"
                type="button"
                onClick={addLine}
                disabled={pending || lines.length >= codes.length}
              >
                Add Cost Code
              </button>
              <div>
                <button
                  className="finance-secondary-button"
                  type="submit"
                  disabled={pending}
                >
                  Save draft
                </button>
                <button
                  className="finance-primary-button"
                  type="button"
                  disabled={pending || lines.length === 0}
                  onClick={() =>
                    run(
                      () => submitProjectBudget(projectId, draft.id),
                      'Budget submitted for Commercial and Finance approval.'
                    )
                  }
                >
                  Submit for approval
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {pendingBudget && (
        <section className="budget-panel budget-review-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">
                Revision {pendingBudget.revision} · Approval
              </p>
              <h2>Independent review</h2>
            </div>
            <p>Commercial validates scope. Finance validates funding.</p>
          </div>
          <div className="budget-approval-lanes">
            <div
              className={
                pendingBudget.commercialApprovedBy ? 'is-approved' : ''
              }
            >
              <span>01</span>
              <strong>Commercial</strong>
              <small>
                {pendingBudget.commercialApprovedBy
                  ? 'Approval captured'
                  : 'Awaiting approver'}
              </small>
              {canCommercialApprove &&
                !pendingBudget.commercialApprovedBy && (
                  <button
                    className="finance-primary-button"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          approveProjectBudget(
                            projectId,
                            pendingBudget.id,
                            'commercial'
                          ),
                        'Commercial approval recorded.'
                      )
                    }
                  >
                    Approve lane
                  </button>
                )}
            </div>
            <div className={pendingBudget.financeApprovedBy ? 'is-approved' : ''}>
              <span>02</span>
              <strong>Finance</strong>
              <small>
                {pendingBudget.financeApprovedBy
                  ? 'Approval captured'
                  : 'Awaiting approver'}
              </small>
              {canFinanceApprove && !pendingBudget.financeApprovedBy && (
                <button
                  className="finance-primary-button"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        approveProjectBudget(
                          projectId,
                          pendingBudget.id,
                          'finance'
                        ),
                      'Finance approval recorded.'
                    )
                  }
                >
                  Approve lane
                </button>
              )}
            </div>
          </div>
          {(canCommercialApprove || canFinanceApprove) && (
            <div className="budget-reject-row">
              <input
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Reason for returning this revision"
                maxLength={1000}
              />
              <button
                type="button"
                className="finance-danger-button"
                disabled={pending || rejectionReason.trim().length < 3}
                onClick={() =>
                  run(
                    () =>
                      rejectProjectBudget(
                        projectId,
                        pendingBudget.id,
                        rejectionReason
                      ),
                    'Budget returned with review evidence.'
                  )
                }
              >
                Reject revision
              </button>
            </div>
          )}
        </section>
      )}

      {approvedBudget && !draft && !pendingBudget && canManage && (
        <section className="budget-panel budget-revision-panel">
          <div>
            <p className="finance-eyebrow">Controlled change</p>
            <h2>Revise the approved baseline</h2>
            <p>
              Revision {approvedBudget.revision} stays effective until the new
              draft receives both approvals.
            </p>
          </div>
          <div>
            <input
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
              maxLength={500}
              placeholder="Why is the baseline changing?"
            />
            <button
              type="button"
              className="finance-primary-button"
              disabled={pending || revisionReason.trim().length < 3}
              onClick={() =>
                run(
                  () =>
                    reviseProjectBudget(
                      projectId,
                      approvedBudget.id,
                      revisionReason
                    ),
                  'New draft created from the approved baseline.'
                )
              }
            >
              Create revision
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
