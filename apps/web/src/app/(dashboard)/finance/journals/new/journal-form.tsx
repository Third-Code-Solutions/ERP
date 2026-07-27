'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createJournalDraft } from '../../actions'

interface Option {
  id: string
  label: string
}

interface DraftLine {
  key: string
  ledgerAccountId: string
  projectId: string
  description: string
  debit: string
  credit: string
}

function blankLine(key: string): DraftLine {
  return {
    key,
    ledgerAccountId: '',
    projectId: '',
    description: '',
    debit: '',
    credit: '',
  }
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return 0
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, decimals = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

function formatTotal(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function JournalForm({
  accounts,
  projects,
  defaultDate,
}: {
  accounts: Option[]
  projects: Option[]
  defaultDate: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [description, setDescription] = useState('')
  const [postingDate, setPostingDate] = useState(defaultDate)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<DraftLine[]>([
    blankLine('line-1'),
    blankLine('line-2'),
  ])

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    let valid = true
    for (const line of lines) {
      const parsedDebit = parseMoney(line.debit)
      const parsedCredit = parseMoney(line.credit)
      if (parsedDebit === null || parsedCredit === null) valid = false
      debit += parsedDebit ?? 0
      credit += parsedCredit ?? 0
    }
    return { debit, credit, valid, balanced: valid && debit > 0 && debit === credit }
  }, [lines])

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )
  }

  function submit() {
    setError(null)
    const mapped = lines.map((line) => ({
      ledgerAccountId: line.ledgerAccountId,
      projectId: line.projectId || null,
      description: line.description || null,
      debitCents: parseMoney(line.debit) ?? -1,
      creditCents: parseMoney(line.credit) ?? -1,
    }))

    startTransition(async () => {
      const result = await createJournalDraft({
        postingDate,
        description,
        lines: mapped,
      })
      if (!result.ok || !result.id) {
        setError(result.error ?? 'Could not save journal draft')
        return
      }
      router.push(`/finance/journals/${result.id}`)
    })
  }

  return (
    <form
      className="journal-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="journal-header-fields">
        <div className="finance-field">
          <label htmlFor="posting-date">Posting date</label>
          <input
            id="posting-date"
            type="date"
            required
            value={postingDate}
            onChange={(event) => setPostingDate(event.target.value)}
          />
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="journal-description">Business reason</label>
          <input
            id="journal-description"
            required
            minLength={3}
            maxLength={2_000}
            placeholder="Record opening cash balance"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <div className="journal-lines">
        <div className="journal-line journal-line-heading" aria-hidden="true">
          <span>Ledger account</span>
          <span>Project</span>
          <span>Line note</span>
          <span>Debit</span>
          <span>Credit</span>
          <span />
        </div>
        {lines.map((line, index) => (
          <div className="journal-line" key={line.key}>
            <label className="sr-only" htmlFor={`account-${line.key}`}>
              Line {index + 1} ledger account
            </label>
            <select
              id={`account-${line.key}`}
              required
              value={line.ledgerAccountId}
              onChange={(event) =>
                updateLine(line.key, { ledgerAccountId: event.target.value })
              }
            >
              <option value="">Choose account</option>
              {accounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`project-${line.key}`}>
              Line {index + 1} project
            </label>
            <select
              id={`project-${line.key}`}
              value={line.projectId}
              onChange={(event) =>
                updateLine(line.key, { projectId: event.target.value })
              }
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`note-${line.key}`}>
              Line {index + 1} note
            </label>
            <input
              id={`note-${line.key}`}
              placeholder="Optional context"
              maxLength={500}
              value={line.description}
              onChange={(event) =>
                updateLine(line.key, { description: event.target.value })
              }
            />
            <label className="sr-only" htmlFor={`debit-${line.key}`}>
              Line {index + 1} debit
            </label>
            <input
              id={`debit-${line.key}`}
              inputMode="decimal"
              placeholder="0.00"
              value={line.debit}
              onChange={(event) =>
                updateLine(line.key, { debit: event.target.value })
              }
            />
            <label className="sr-only" htmlFor={`credit-${line.key}`}>
              Line {index + 1} credit
            </label>
            <input
              id={`credit-${line.key}`}
              inputMode="decimal"
              placeholder="0.00"
              value={line.credit}
              onChange={(event) =>
                updateLine(line.key, { credit: event.target.value })
              }
            />
            <button
              type="button"
              className="journal-remove-line"
              disabled={lines.length <= 2}
              aria-label={`Remove line ${index + 1}`}
              onClick={() =>
                setLines((current) =>
                  current.filter((candidate) => candidate.key !== line.key)
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="journal-footer">
        <button
          className="finance-text-button"
          type="button"
          onClick={() =>
            setLines((current) => [...current, blankLine(crypto.randomUUID())])
          }
        >
          + Add line
        </button>
        <div className="journal-totals" aria-live="polite">
          <span>Debit <strong>{formatTotal(totals.debit)}</strong></span>
          <span>Credit <strong>{formatTotal(totals.credit)}</strong></span>
          <span className={totals.balanced ? 'is-balanced' : 'is-unbalanced'}>
            {totals.balanced ? 'Balanced' : 'Out of balance'}
          </span>
        </div>
      </div>

      {error && <p className="finance-form-error">{error}</p>}

      <div className="journal-submit-row">
        <p>
          Saving creates a draft. Posting happens on the review screen after
          database validation.
        </p>
        <button
          className="finance-primary-button"
          type="submit"
          disabled={pending || !totals.balanced}
        >
          {pending ? 'Saving draft…' : 'Review draft'}
        </button>
      </div>
    </form>
  )
}
