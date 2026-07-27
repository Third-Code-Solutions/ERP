'use client'

import { useRef, useState, useTransition } from 'react'
import {
  assignPayablesSystemAccount,
  assignInventorySystemAccount,
  assignReceivablesSystemAccount,
  closeFiscalPeriod,
  createCashAccount,
  createFiscalPeriod,
  createLedgerAccount,
} from './actions'

const RECEIVABLE_MAPPINGS = [
  {
    key: 'accounts_receivable',
    label: 'Accounts Receivable',
    accountType: 'asset',
  },
  {
    key: 'retention_receivable',
    label: 'Retention Receivable',
    accountType: 'asset',
  },
  {
    key: 'withholding_tax_receivable',
    label: 'Withholding Tax Receivable',
    accountType: 'asset',
  },
  { key: 'revenue', label: 'Revenue', accountType: 'income' },
  {
    key: 'output_vat_payable',
    label: 'Output VAT Payable',
    accountType: 'liability',
  },
] as const

const PAYABLE_MAPPINGS = [
  {
    key: 'accounts_payable',
    label: 'Accounts Payable',
    accountType: 'liability',
  },
  {
    key: 'input_vat_receivable',
    label: 'Input VAT Receivable',
    accountType: 'asset',
  },
  {
    key: 'withholding_tax_payable',
    label: 'Withholding Tax Payable',
    accountType: 'liability',
  },
] as const

const INVENTORY_MAPPINGS = [
  { key: 'inventory', label: 'Inventory', accountType: 'asset' },
  {
    key: 'goods_received_not_invoiced',
    label: 'Goods Received Not Invoiced',
    accountType: 'liability',
  },
] as const

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: React.ReactNode
}) {
  return (
    <button className="finance-primary-button" type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  )
}

export function CreateLedgerAccountForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createLedgerAccount(formData)
      if (!result.ok) {
        setError(result.error ?? 'Could not create ledger account')
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={submit} className="finance-setup-form">
      <div className="finance-field">
        <label htmlFor="ledger-code">Code</label>
        <input id="ledger-code" name="code" required maxLength={30} placeholder="6100" />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="ledger-name">Ledger account</label>
        <input
          id="ledger-name"
          name="name"
          required
          minLength={2}
          maxLength={160}
          placeholder="Travel and transport"
        />
      </div>
      <div className="finance-field">
        <label htmlFor="ledger-type">Type</label>
        <select id="ledger-type" name="accountType" defaultValue="expense">
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <SubmitButton pending={pending}>Add account</SubmitButton>
      {error && <p className="finance-form-error">{error}</p>}
    </form>
  )
}

export function CreateCashAccountForm({
  assetAccounts,
}: {
  assetAccounts: Array<{ id: string; code: string; name: string }>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createCashAccount(formData)
      if (!result.ok) {
        setError(result.error ?? 'Could not create Cash Account')
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={submit} className="finance-setup-form">
      <div className="finance-field finance-field-grow">
        <label htmlFor="cash-account-name">Cash Account</label>
        <input
          id="cash-account-name"
          name="name"
          required
          minLength={2}
          maxLength={160}
          placeholder="BDO operating account"
        />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="cash-ledger-account">Asset ledger</label>
        <select id="cash-ledger-account" name="ledgerAccountId" required>
          <option value="">Choose asset account</option>
          {assetAccounts.map((account) => (
            <option value={account.id} key={account.id}>
              {account.code} · {account.name}
            </option>
          ))}
        </select>
      </div>
      <div className="finance-field">
        <label htmlFor="cash-account-kind">Kind</label>
        <select
          id="cash-account-kind"
          name="accountKind"
          defaultValue="bank"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="e_wallet">E-wallet</option>
        </select>
      </div>
      <div className="finance-field">
        <label htmlFor="cash-bank-name">Institution</label>
        <input
          id="cash-bank-name"
          name="bankName"
          maxLength={160}
          placeholder="BDO"
        />
      </div>
      <div className="finance-field">
        <label htmlFor="cash-last-four">Last 4</label>
        <input
          id="cash-last-four"
          name="identifierLast4"
          minLength={4}
          maxLength={4}
          pattern="[A-Za-z0-9]{4}"
          placeholder="4821"
        />
      </div>
      <SubmitButton pending={pending}>Add Cash Account</SubmitButton>
      {error && <p className="finance-form-error">{error}</p>}
    </form>
  )
}

export function CreateFiscalPeriodForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createFiscalPeriod(formData)
      if (!result.ok) {
        setError(result.error ?? 'Could not create fiscal period')
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={submit} className="finance-setup-form">
      <div className="finance-field finance-field-grow">
        <label htmlFor="period-name">Period</label>
        <input
          id="period-name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          placeholder="FY 2027"
        />
      </div>
      <div className="finance-field">
        <label htmlFor="period-start">Starts</label>
        <input id="period-start" name="startsOn" type="date" required />
      </div>
      <div className="finance-field">
        <label htmlFor="period-end">Ends</label>
        <input id="period-end" name="endsOn" type="date" required />
      </div>
      <SubmitButton pending={pending}>Add period</SubmitButton>
      {error && <p className="finance-form-error">{error}</p>}
    </form>
  )
}

export function ClosePeriodButton({ periodId }: { periodId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <button
        type="button"
        className="finance-text-button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('Close this fiscal period? It cannot be reopened.')) {
            return
          }
          setError(null)
          startTransition(async () => {
            const result = await closeFiscalPeriod(periodId)
            if (!result.ok) setError(result.error ?? 'Could not close period')
          })
        }}
      >
        {pending ? 'Closing…' : 'Close period'}
      </button>
      {error && <p className="finance-inline-error">{error}</p>}
    </div>
  )
}

export function ReceivablesAccountMapping({
  accounts,
  current,
}: {
  accounts: Array<{
    id: string
    code: string
    name: string
    accountType: string
  }>
  current: Record<string, string>
}) {
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="finance-mapping-grid">
      {RECEIVABLE_MAPPINGS.map((mapping) => {
        const options = accounts.filter(
          (account) => account.accountType === mapping.accountType
        )
        return (
          <form
            key={mapping.key}
            action={(formData) => {
              setError(null)
              setSavedKey(null)
              startTransition(async () => {
                const result = await assignReceivablesSystemAccount({
                  systemKey: mapping.key,
                  ledgerAccountId: String(
                    formData.get('ledgerAccountId') ?? ''
                  ),
                })
                if (!result.ok) {
                  setError(result.error ?? 'Could not save account mapping')
                  return
                }
                setSavedKey(mapping.key)
              })
            }}
            className="finance-mapping-row"
          >
            <label htmlFor={`mapping-${mapping.key}`}>{mapping.label}</label>
            <select
              id={`mapping-${mapping.key}`}
              name="ledgerAccountId"
              defaultValue={current[mapping.key] ?? ''}
              required
            >
              <option value="" disabled>
                Select {mapping.accountType} account
              </option>
              {options.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </select>
            <button
              className="finance-text-button"
              type="submit"
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {savedKey === mapping.key && (
              <span className="finance-mapping-saved">Saved</span>
            )}
          </form>
        )
      })}
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function PayablesAccountMapping({
  accounts,
  current,
}: {
  accounts: Array<{
    id: string
    code: string
    name: string
    accountType: string
  }>
  current: Record<string, string>
}) {
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="finance-mapping-grid">
      {PAYABLE_MAPPINGS.map((mapping) => {
        const options = accounts.filter(
          (account) => account.accountType === mapping.accountType
        )
        return (
          <form
            key={mapping.key}
            action={(formData) => {
              setError(null)
              setSavedKey(null)
              startTransition(async () => {
                const result = await assignPayablesSystemAccount({
                  systemKey: mapping.key,
                  ledgerAccountId: String(
                    formData.get('ledgerAccountId') ?? ''
                  ),
                })
                if (!result.ok) {
                  setError(result.error ?? 'Could not save account mapping')
                  return
                }
                setSavedKey(mapping.key)
              })
            }}
            className="finance-mapping-row"
          >
            <label htmlFor={`mapping-${mapping.key}`}>{mapping.label}</label>
            <select
              id={`mapping-${mapping.key}`}
              name="ledgerAccountId"
              defaultValue={current[mapping.key] ?? ''}
              required
            >
              <option value="" disabled>
                Select {mapping.accountType} account
              </option>
              {options.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </select>
            <button
              className="finance-text-button"
              type="submit"
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {savedKey === mapping.key && (
              <span className="finance-mapping-saved">Saved</span>
            )}
          </form>
        )
      })}
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function InventoryAccountMapping({
  accounts,
  current,
}: {
  accounts: Array<{
    id: string
    code: string
    name: string
    accountType: string
  }>
  current: Record<string, string>
}) {
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="finance-mapping-grid">
      {INVENTORY_MAPPINGS.map((mapping) => (
        <form
          key={mapping.key}
          action={(formData) => {
            setError(null)
            setSavedKey(null)
            startTransition(async () => {
              const result = await assignInventorySystemAccount({
                systemKey: mapping.key,
                ledgerAccountId: String(
                  formData.get('ledgerAccountId') ?? ''
                ),
              })
              if (!result.ok) {
                setError(result.error ?? 'Could not save account mapping')
                return
              }
              setSavedKey(mapping.key)
            })
          }}
          className="finance-mapping-row"
        >
          <label htmlFor={`mapping-${mapping.key}`}>{mapping.label}</label>
          <select
            id={`mapping-${mapping.key}`}
            name="ledgerAccountId"
            defaultValue={current[mapping.key] ?? ''}
            required
          >
            <option value="" disabled>
              Select {mapping.accountType} account
            </option>
            {accounts
              .filter(
                (account) => account.accountType === mapping.accountType
              )
              .map((account) => (
                <option value={account.id} key={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
          </select>
          <button
            className="finance-text-button"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
          {savedKey === mapping.key && (
            <span className="finance-mapping-saved">Saved</span>
          )}
        </form>
      ))}
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
