'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCashDraft } from './actions'

export interface CashAccountOption {
  id: string
  label: string
}

export interface CashTargetOption {
  key: string
  targetId: string
  counterpartyId: string
  counterpartyName: string
  allocationType:
    | 'customer_current_due'
    | 'customer_retention'
    | 'supplier_bill'
  label: string
  remainingCents: number
}

interface DraftLine {
  key: string
  targetKey: string
  description: string
  amount: string
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, decimals = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function blankLine(key: string): DraftLine {
  return { key, targetKey: '', description: '', amount: '' }
}

export function CashForm({
  cashAccounts,
  receiptTargets,
  disbursementTargets,
  defaultDate,
}: {
  cashAccounts: CashAccountOption[]
  receiptTargets: CashTargetOption[]
  disbursementTargets: CashTargetOption[]
  defaultDate: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<'receipt' | 'disbursement'>(
    'receipt'
  )
  const [cashAccountId, setCashAccountId] = useState(cashAccounts[0]?.id ?? '')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [transactionDate, setTransactionDate] = useState(defaultDate)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine('allocation-1')])
  const saveIdempotencyKey = useRef<string | null>(null)

  const allTargets =
    direction === 'receipt' ? receiptTargets : disbursementTargets
  const counterparties = useMemo(
    () =>
      Array.from(
        new Map(
          allTargets.map((target) => [
            target.counterpartyId,
            {
              id: target.counterpartyId,
              name: target.counterpartyName,
            },
          ])
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
    [allTargets]
  )
  const targets = allTargets.filter(
    (target) => target.counterpartyId === counterpartyId
  )
  const totalCents = lines.reduce(
    (total, line) => total + (parseMoney(line.amount) ?? 0),
    0
  )
  const valid =
    !!cashAccountId &&
    !!counterpartyId &&
    !!referenceNumber.trim() &&
    lines.every((line) => {
      const target = targets.find((candidate) => candidate.key === line.targetKey)
      const amount = parseMoney(line.amount)
      return !!target && amount !== null && amount > 0
    })

  function resetEvidence(nextDirection: 'receipt' | 'disbursement') {
    setDirection(nextDirection)
    setCounterpartyId('')
    setLines([blankLine(crypto.randomUUID())])
    setError(null)
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )
  }

  return (
    <form
      className="payable-form"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const allocations = lines.map((line) => {
            const target = targets.find(
              (candidate) => candidate.key === line.targetKey
            )
            return {
              allocationType:
                target?.allocationType ?? 'customer_current_due',
              targetId: target?.targetId ?? '',
              description: line.description || null,
              amountCents: parseMoney(line.amount) ?? -1,
            }
          })
          const result = await saveCashDraft(
            {
              cashAccountId,
              direction,
              counterpartyId,
              referenceNumber,
              transactionDate,
              notes: notes || null,
              allocations,
            },
            (saveIdempotencyKey.current ??= globalThis.crypto.randomUUID())
          )
          if (!result.ok || !result.id) {
            setError(result.error ?? 'Could not save cash draft')
            return
          }
          saveIdempotencyKey.current = null
          router.push(`/finance/cash/${result.id}`)
        })
      }}
    >
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">1 · Cash evidence</p>
            <h2>Identify the movement</h2>
          </div>
          <p>One Cash Account, one counterparty, one auditable reference.</p>
        </div>
        <div className="payable-header-fields">
          <div className="finance-field">
            <label htmlFor="cash-direction">Direction</label>
            <select
              id="cash-direction"
              value={direction}
              onChange={(event) =>
                resetEvidence(
                  event.target.value as 'receipt' | 'disbursement'
                )
              }
            >
              <option value="receipt">Customer receipt</option>
              <option value="disbursement">Vendor disbursement</option>
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="cash-account">Cash Account</label>
            <select
              id="cash-account"
              required
              value={cashAccountId}
              onChange={(event) => setCashAccountId(event.target.value)}
            >
              {cashAccounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="cash-counterparty">
              {direction === 'receipt' ? 'Business Account' : 'Vendor'}
            </label>
            <select
              id="cash-counterparty"
              required
              value={counterpartyId}
              onChange={(event) => {
                setCounterpartyId(event.target.value)
                setLines([blankLine(crypto.randomUUID())])
              }}
            >
              <option value="">Choose open counterparty</option>
              {counterparties.map((counterparty) => (
                <option value={counterparty.id} key={counterparty.id}>
                  {counterparty.name}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="cash-reference">Bank or receipt reference</label>
            <input
              id="cash-reference"
              required
              maxLength={100}
              placeholder="OR-2027-00128"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="cash-date">Transaction date</label>
            <input
              id="cash-date"
              type="date"
              required
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">2 · Subledger allocation</p>
            <h2>
              {direction === 'receipt'
                ? 'Settle invoice components'
                : 'Settle supplier bills'}
            </h2>
          </div>
          <p>Posting is blocked if any allocation exceeds the live open balance.</p>
        </div>
        <div className="payable-lines">
          <div className="payable-line payable-line-heading" aria-hidden="true">
            <span>Open item</span>
            <span>Description</span>
            <span>Amount</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const selected = targets.find(
              (target) => target.key === line.targetKey
            )
            return (
              <div className="payable-line" key={line.key}>
                <label className="sr-only" htmlFor={`cash-target-${line.key}`}>
                  Allocation {index + 1} open item
                </label>
                <select
                  id={`cash-target-${line.key}`}
                  required
                  value={line.targetKey}
                  onChange={(event) =>
                    updateLine(line.key, { targetKey: event.target.value })
                  }
                >
                  <option value="">Choose open item</option>
                  {targets.map((target) => (
                    <option value={target.key} key={target.key}>
                      {target.label} · {formatPHP(target.remainingCents)} open
                    </option>
                  ))}
                </select>
                <label
                  className="sr-only"
                  htmlFor={`cash-description-${line.key}`}
                >
                  Allocation {index + 1} description
                </label>
                <input
                  id={`cash-description-${line.key}`}
                  maxLength={500}
                  placeholder="Settlement evidence"
                  value={line.description}
                  onChange={(event) =>
                    updateLine(line.key, { description: event.target.value })
                  }
                />
                <label className="sr-only" htmlFor={`cash-amount-${line.key}`}>
                  Allocation {index + 1} amount
                </label>
                <input
                  id={`cash-amount-${line.key}`}
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.amount}
                  aria-describedby={
                    selected ? `cash-limit-${line.key}` : undefined
                  }
                  onChange={(event) =>
                    updateLine(line.key, { amount: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="journal-remove-line"
                  disabled={lines.length === 1}
                  aria-label={`Remove allocation ${index + 1}`}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((candidate) => candidate.key !== line.key)
                    )
                  }
                >
                  ×
                </button>
                {selected && (
                  <span id={`cash-limit-${line.key}`} className="sr-only">
                    Maximum open amount {formatPHP(selected.remainingCents)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="finance-text-button"
          disabled={!counterpartyId}
          onClick={() =>
            setLines((current) => [
              ...current,
              blankLine(crypto.randomUUID()),
            ])
          }
        >
          + Add allocation
        </button>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">3 · Review</p>
            <h2>Confirm the evidence total</h2>
          </div>
          <p>No ledger movement exists until Finance posts the reviewed draft.</p>
        </div>
        <div className="payable-tax-fields">
          <div className="finance-field finance-field-grow">
            <label htmlFor="cash-notes">Internal note</label>
            <input
              id="cash-notes"
              maxLength={2_000}
              placeholder="Deposit date, remittance, or approval note"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <div className="payable-review">
          <div className="payable-review-total">
            <span>{direction === 'receipt' ? 'Receipt' : 'Disbursement'} total</span>
            <strong>{formatPHP(totalCents)}</strong>
          </div>
        </div>
        {error && (
          <p className="finance-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journal-submit-row">
          <p>Save as draft. Posting performs the final live balance checks.</p>
          <button
            type="submit"
            className="finance-primary-button"
            disabled={pending || !valid}
          >
            {pending ? 'Saving draft…' : 'Review cash transaction'}
          </button>
        </div>
      </section>
    </form>
  )
}
