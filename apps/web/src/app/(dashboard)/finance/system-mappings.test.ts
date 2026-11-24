import { describe, expect, it } from 'vitest'
import {
  cashAccountKindLabel,
  correctlyMappedSystemKeys,
  journalSourceLabel,
  ledgerAccountTypeLabel,
  missingFinanceSetup,
  PAYABLE_MAPPINGS,
  RECEIVABLE_MAPPINGS,
} from './system-mappings'

const ALL_KEYS = new Set<string>([
  ...RECEIVABLE_MAPPINGS.map((mapping) => mapping.key),
  ...PAYABLE_MAPPINGS.map((mapping) => mapping.key),
])

describe('missingFinanceSetup', () => {
  it('is empty once accounts, a period, control accounts and a cash account exist', () => {
    expect(
      missingFinanceSetup({
        activeAccountCount: 2,
        openPeriodCount: 1,
        activeCashAccountCount: 1,
        mappedSystemKeys: ALL_KEYS,
      })
    ).toEqual([])
  })

  it('still reports the setup that the old two-accounts-and-a-period check ignored', () => {
    expect(
      missingFinanceSetup({
        activeAccountCount: 2,
        openPeriodCount: 1,
        activeCashAccountCount: 0,
        mappedSystemKeys: new Set(),
      })
    ).toEqual([
      'Receivables control accounts: Accounts Receivable, Retention Receivable, Withholding Tax Receivable, Revenue, Output VAT Payable',
      'Payables control accounts: Accounts Payable, Input VAT Receivable, Withholding Tax Payable',
      'At least one active cash account',
    ])
  })

  it('names only the control accounts that are still unmapped', () => {
    const mapped = new Set(ALL_KEYS)
    mapped.delete('revenue')
    mapped.delete('accounts_payable')
    expect(
      missingFinanceSetup({
        activeAccountCount: 5,
        openPeriodCount: 1,
        activeCashAccountCount: 1,
        mappedSystemKeys: mapped,
      })
    ).toEqual([
      'Receivables control accounts: Revenue',
      'Payables control accounts: Accounts Payable',
    ])
  })

  it('lists accounts and period first on a new tenant', () => {
    expect(
      missingFinanceSetup({
        activeAccountCount: 1,
        openPeriodCount: 0,
        activeCashAccountCount: 0,
        mappedSystemKeys: ALL_KEYS,
      })
    ).toEqual([
      'At least two active ledger accounts',
      'An open fiscal period',
      'At least one active cash account',
    ])
  })
})

describe('correctlyMappedSystemKeys', () => {
  it('counts a control key only on an account of the type posting requires', () => {
    expect(
      correctlyMappedSystemKeys([
        { system_key: 'accounts_receivable', account_type: 'asset' },
        // Posting needs a liability for Accounts Payable, so this one is not ready.
        { system_key: 'accounts_payable', account_type: 'asset' },
        { system_key: 'inventory', account_type: 'asset' },
        { system_key: null, account_type: 'expense' },
      ])
    ).toEqual(new Set(['accounts_receivable', 'inventory']))
  })

  it('reports a wrong-type control account as missing setup', () => {
    const accounts = [...RECEIVABLE_MAPPINGS, ...PAYABLE_MAPPINGS].map(
      (mapping) => ({ system_key: mapping.key, account_type: mapping.accountType })
    )
    accounts[0] = { system_key: 'accounts_receivable', account_type: 'income' }

    expect(
      missingFinanceSetup({
        activeAccountCount: accounts.length,
        openPeriodCount: 1,
        activeCashAccountCount: 1,
        mappedSystemKeys: correctlyMappedSystemKeys(accounts),
      })
    ).toEqual(['Receivables control accounts: Accounts Receivable'])
  })
})

describe('display labels', () => {
  it('replaces raw enum values with readable text', () => {
    expect(cashAccountKindLabel('e_wallet')).toBe('E-wallet')
    expect(journalSourceLabel('system')).toBe('System-generated')
    expect(ledgerAccountTypeLabel('asset', 'debit')).toBe(
      'Asset · increases with debits'
    )
  })

  it('falls back to the stored value for an unknown code', () => {
    expect(cashAccountKindLabel('crypto')).toBe('crypto')
    expect(journalSourceLabel('import')).toBe('import')
  })
})
