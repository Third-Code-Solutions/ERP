'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBankStatement } from './actions'

interface CashAccountOption {
  id: string
  label: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the CSV file'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the CSV file'))
        return
      }
      const separator = reader.result.indexOf(',')
      if (separator < 0) {
        reject(new Error('Could not encode the CSV file'))
        return
      }
      resolve(reader.result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}

function parseSignedMoney(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized || !/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, decimals = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

export function BankStatementImportForm({
  cashAccounts,
  defaultStart,
  defaultEnd,
}: {
  cashAccounts: CashAccountOption[]
  defaultStart: string
  defaultEnd: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cashAccountId, setCashAccountId] = useState(cashAccounts[0]?.id ?? '')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [statementStart, setStatementStart] = useState(defaultStart)
  const [statementEnd, setStatementEnd] = useState(defaultEnd)
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openingBalanceCents = parseSignedMoney(openingBalance)
  const closingBalanceCents = parseSignedMoney(closingBalance)
  const valid =
    !!cashAccountId &&
    !!referenceNumber.trim() &&
    statementStart <= statementEnd &&
    openingBalanceCents !== null &&
    closingBalanceCents !== null &&
    !!file &&
    file.size <= 2_000_000

  return (
    <form
      className="payable-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid || !file) return
        setError(null)
        startTransition(async () => {
          let sourceBase64: string
          try {
            sourceBase64 = await fileToBase64(file)
          } catch (readError) {
            setError(
              readError instanceof Error
                ? readError.message
                : 'Could not read the CSV file'
            )
            return
          }
          const result = await createBankStatement({
            cashAccountId,
            referenceNumber,
            sourceFileName: file.name,
            statementStart,
            statementEnd,
            openingBalanceCents: openingBalanceCents!,
            closingBalanceCents: closingBalanceCents!,
            sourceBase64,
          })
          if (!result.ok || !result.id) {
            setError(result.error ?? 'Could not import bank statement')
            return
          }
          router.push(`/finance/reconciliation/${result.id}`)
        })
      }}
    >
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">1 / Statement identity</p>
            <h2>Identify the institution record</h2>
          </div>
          <p>One unique statement reference per Cash Account.</p>
        </div>
        <div className="reconciliation-import-grid">
          <div className="finance-field finance-field-grow">
            <label htmlFor="statement-cash-account">Cash Account</label>
            <select
              id="statement-cash-account"
              required
              value={cashAccountId}
              onChange={(event) => setCashAccountId(event.target.value)}
            >
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </div>
          <div className="finance-field finance-field-grow">
            <label htmlFor="statement-reference">Statement reference</label>
            <input
              id="statement-reference"
              required
              maxLength={120}
              placeholder="JUL-2026-001"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="statement-start">Period start</label>
            <input
              id="statement-start"
              type="date"
              required
              value={statementStart}
              onChange={(event) => setStatementStart(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="statement-end">Period end</label>
            <input
              id="statement-end"
              type="date"
              required
              value={statementEnd}
              onChange={(event) => setStatementEnd(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">2 / Balance proof</p>
            <h2>Declare statement balances</h2>
          </div>
          <p>Opening balance plus signed CSV lines must equal closing balance.</p>
        </div>
        <div className="reconciliation-balance-grid">
          <div className="finance-field">
            <label htmlFor="statement-opening">Opening balance</label>
            <input
              id="statement-opening"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
          </div>
          <div className="finance-field">
            <label htmlFor="statement-closing">Closing balance</label>
            <input
              id="statement-closing"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={closingBalance}
              onChange={(event) => setClosingBalance(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">3 / Source file</p>
            <h2>Upload signed transaction lines</h2>
          </div>
          <p>Required headers: date, reference, description, amount.</p>
        </div>
        <div className="reconciliation-upload">
          <label htmlFor="statement-csv">
            <strong>Bank statement CSV</strong>
            <span>
              Positive amounts are receipts. Negative amounts are
              disbursements. Maximum 5,000 lines and 2 MB.
            </span>
            <Link
              href="/samples/bank-statement-template.csv"
              download
              className="reconciliation-template-link"
            >
              Download CSV template
            </Link>
          </label>
          <input
            id="statement-csv"
            type="file"
            required
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setError(null)
            }}
          />
          {file && (
            <p className="finance-control-note">
              {file.name} / {new Intl.NumberFormat('en').format(file.size)} bytes
            </p>
          )}
        </div>
        {error && (
          <p className="finance-form-error reconciliation-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journal-submit-row">
          <p>
            Import creates a reviewable draft. No cash or ledger posting is
            changed.
          </p>
          <button
            type="submit"
            className="finance-primary-button"
            disabled={pending || !valid}
          >
            {pending ? 'Validating statement...' : 'Import statement draft'}
          </button>
        </div>
      </section>
    </form>
  )
}
