'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import {
  autoMatchBankStatement,
  deleteBankStatementDraft,
  matchBankStatementLine,
  reconcileBankStatement,
  unmatchBankStatementLine,
  voidBankStatement,
} from '../actions'

export interface ReconciliationLine {
  id: string
  line_number: number
  transaction_date: string
  reference_number: string | null
  description: string
  amount_cents: number
  matched_cash_transaction_id: string | null
  matched_at: string | null
  matched_internal_number: string | null
  matched_reference_number: string | null
  matched_transaction_date: string | null
}

export interface ReconciliationCandidate {
  id: string
  internal_number: string | null
  reference_number: string
  transaction_date: string
  direction: 'receipt' | 'disbursement'
  amount_cents: number
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function BankStatementActions({
  statementId,
  status,
  currency,
  lines,
  candidates,
}: {
  statementId: string
  status: 'draft' | 'reconciled' | 'voided'
  currency: string
  lines: ReconciliationLine[]
  candidates: ReconciliationCandidate[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [voidReason, setVoidReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const autoMatchRetryKey = useRef<string | null>(null)
  const reconcileRetryKey = useRef<string | null>(null)
  const voidRetryKey = useRef<string | null>(null)
  const lineRetryKeys = useRef<Record<string, string>>({})

  function lineRetryKey(action: 'match' | 'unmatch', lineId: string): string {
    const key = `${action}:${lineId}`
    return (lineRetryKeys.current[key] ??= `line-${action}-${globalThis.crypto.randomUUID()}`)
  }

  function clearLineRetryKey(action: 'match' | 'unmatch', lineId: string) {
    delete lineRetryKeys.current[`${action}:${lineId}`]
  }

  const matchedCount = lines.filter(
    (line) => line.matched_cash_transaction_id
  ).length
  const unmatchedCount = lines.length - matchedCount
  const candidatesByLine = useMemo(
    () =>
      Object.fromEntries(
        lines.map((line) => [
          line.id,
          candidates.filter(
            (candidate) =>
              candidate.amount_cents === Math.abs(line.amount_cents) &&
              candidate.direction ===
                (line.amount_cents > 0 ? 'receipt' : 'disbursement')
          ),
        ])
      ),
    [candidates, lines]
  )

  function runAction(
    action: () => Promise<{
      ok: boolean
      error?: string
      matchedCount?: number
      remainingCount?: number
    }>,
    onSuccess?: (result: {
      matchedCount?: number
      remainingCount?: number
    }) => void
  ) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? 'Reconciliation action failed')
        return
      }
      onSuccess?.(result)
      router.refresh()
    })
  }

  return (
    <>
      {status === 'draft' && (
        <div className="reconciliation-toolbar">
          <div>
            <strong>{unmatchedCount} exceptions</strong>
            <span>
              Exact automation uses amount, direction, account, currency, and
              a seven-day date window.
            </span>
          </div>
          <button
            type="button"
            className="finance-secondary-button"
            disabled={pending || unmatchedCount === 0}
            onClick={() =>
              runAction(
                () =>
                  autoMatchBankStatement(
                    statementId,
                    (autoMatchRetryKey.current ??=
                      `auto-match-${globalThis.crypto.randomUUID()}`)
                  ),
                (result) => {
                  autoMatchRetryKey.current = null
                  setNotice(
                    `${result.matchedCount ?? 0} exact matches added; ${
                      result.remainingCount ?? 0
                    } exceptions remain.`
                  )
                }
              )
            }
          >
            {pending ? 'Working...' : 'Run exact auto-match'}
          </button>
        </div>
      )}

      {(error || notice) && (
        <p
          className={
            error
              ? 'finance-form-error reconciliation-banner'
              : 'reconciliation-banner reconciliation-banner-success'
          }
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
        </p>
      )}

      <div className="finance-table-shell">
        <table className="data-table reconciliation-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Date</th>
              <th>Statement reference</th>
              <th>Description</th>
              <th className="numeric">Signed amount</th>
              <th>Cash evidence</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const lineCandidates = candidatesByLine[line.id] ?? []
              return (
                <tr key={line.id}>
                  <td>{line.line_number}</td>
                  <td>{line.transaction_date}</td>
                  <td>{line.reference_number ?? '-'}</td>
                  <td>{line.description}</td>
                  <td
                    className={`numeric reconciliation-amount ${
                      line.amount_cents < 0 ? 'is-outflow' : 'is-inflow'
                    }`}
                  >
                    {formatMoney(line.amount_cents, currency)}
                  </td>
                  <td>
                    {line.matched_cash_transaction_id ? (
                      <div className="reconciliation-match">
                        <div>
                          <Link
                            href={`/finance/cash/${line.matched_cash_transaction_id}`}
                            className="finance-entry-link"
                          >
                            {line.matched_internal_number ??
                              line.matched_reference_number}
                          </Link>
                          <span>{line.matched_transaction_date}</span>
                        </div>
                        {status === 'draft' && (
                          <button
                            type="button"
                            className="finance-text-button"
                            disabled={pending}
                            onClick={() =>
                              runAction(() =>
                                unmatchBankStatementLine({
                                  lineId: line.id,
                                  statementId,
                                  idempotencyKey: lineRetryKey(
                                    'unmatch',
                                    line.id
                                  ),
                                }),
                                () => clearLineRetryKey('unmatch', line.id)
                              )
                            }
                          >
                            Unmatch
                          </button>
                        )}
                      </div>
                    ) : status === 'draft' ? (
                      <div className="reconciliation-manual-match">
                        <label className="sr-only" htmlFor={`match-${line.id}`}>
                          Cash transaction for line {line.line_number}
                        </label>
                        <select
                          id={`match-${line.id}`}
                          value={selected[line.id] ?? ''}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {lineCandidates.length === 0
                              ? 'No amount match'
                              : 'Choose cash evidence'}
                          </option>
                          {lineCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.internal_number ??
                                candidate.reference_number}{' '}
                              / {candidate.transaction_date}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="finance-secondary-button"
                          disabled={pending || !selected[line.id]}
                          onClick={() =>
                              runAction(() =>
                                matchBankStatementLine({
                                  lineId: line.id,
                                  statementId,
                                  cashTransactionId: selected[line.id]!,
                                  idempotencyKey: lineRetryKey(
                                    'match',
                                    line.id
                                  ),
                                }),
                                () => clearLineRetryKey('match', line.id)
                              )
                          }
                        >
                          Match
                        </button>
                      </div>
                    ) : (
                      <span className="finance-status finance-status-overdue">
                        unmatched
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {status === 'draft' && (
        <div className="reconciliation-finalize">
          <div>
            <strong>Finalize statement</strong>
            <span>
              Reconciliation locks every line and revalidates the roll-forward
              and matched cash in one transaction.
            </span>
          </div>
          <div className="finance-action-buttons">
            <button
              type="button"
              className="finance-text-button finance-danger-button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    'Delete this draft statement and all imported lines?'
                  )
                ) {
                  return
                }
                runAction(
                  () => deleteBankStatementDraft(statementId),
                  () => router.push('/finance/reconciliation')
                )
              }}
            >
              Delete draft
            </button>
            <button
              type="button"
              className="finance-primary-button"
              disabled={pending || unmatchedCount > 0 || lines.length === 0}
              onClick={() => {
                if (
                  !window.confirm(
                    'Reconcile and lock this complete statement evidence?'
                  )
                ) {
                  return
                }
                runAction(
                  () =>
                    reconcileBankStatement(
                      statementId,
                      (reconcileRetryKey.current ??= `reconcile-${globalThis.crypto.randomUUID()}`)
                    ),
                  () => {
                    reconcileRetryKey.current = null
                  }
                )
              }}
            >
              {pending ? 'Finalizing...' : 'Reconcile statement'}
            </button>
          </div>
        </div>
      )}

      {status === 'reconciled' && (
        <div className="reconciliation-finalize">
          <div>
            <strong>Void reconciliation</strong>
            <span>
              Use only for a correction. Original lines and matches remain as
              historical evidence.
            </span>
          </div>
          <div className="reconciliation-void-control">
            <label className="sr-only" htmlFor="reconciliation-void-reason">
              Void reason
            </label>
            <input
              id="reconciliation-void-reason"
              minLength={3}
              maxLength={500}
              placeholder="Reason for correcting this reconciliation"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
            <button
              type="button"
              className="finance-secondary-button finance-danger-button"
              disabled={pending || voidReason.trim().length < 3}
              onClick={() => {
                if (!window.confirm('Void this reconciled statement?')) return
                runAction(
                  () =>
                    voidBankStatement({
                      statementId,
                      reason: voidReason,
                      idempotencyKey: (voidRetryKey.current ??=
                        `void-${globalThis.crypto.randomUUID()}`),
                    }),
                  () => {
                    voidRetryKey.current = null
                  }
                )
              }}
            >
              {pending ? 'Voiding...' : 'Void reconciliation'}
            </button>
          </div>
        </div>
      )}

      {status === 'voided' && (
        <p className="finance-control-note reconciliation-void-note">
          Voided reconciliation. Source lines and original match evidence
          remain immutable and queryable.
        </p>
      )}
    </>
  )
}
