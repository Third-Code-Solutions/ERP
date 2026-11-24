import { describe, expect, it } from 'vitest'

import { errorChainMessage, errorChainSqlState } from './error-chain-message'

describe('errorChainMessage', () => {
  it('exposes the database rule text wrapped by a driver error', () => {
    const rule = new Error('Posting date is not in an open fiscal period')
    const wrapped = new Error('Failed query: select post_journal_entry($1)', {
      cause: rule,
    })

    expect(errorChainMessage(wrapped)).toContain(
      'Posting date is not in an open fiscal period'
    )
  })

  it('leaves out the query wrapper, so typed parameters cannot choose the message', () => {
    const driver = Object.assign(
      new Error('duplicate key value violates unique constraint "ux_supplier_bills_internal_number"'),
      { code: '23505' }
    )
    const wrapped = new Error(
      'Failed query: insert into "cash_transactions" values ($1)\nparams: ux_cash_transactions_reference',
      { cause: driver }
    )

    const message = errorChainMessage(wrapped)
    expect(message).not.toContain('ux_cash_transactions_reference')
    expect(message).not.toContain('insert into')
    expect(message).toContain('ux_supplier_bills_internal_number')
  })

  it('returns an empty string for non-errors', () => {
    expect(errorChainMessage('boom')).toBe('')
    expect(errorChainMessage(undefined)).toBe('')
  })

  it('stops on a circular cause chain', () => {
    const a = new Error('a')
    const b = new Error('b', { cause: a })
    a.cause = b

    expect(errorChainMessage(a)).toBe('a\nb')
  })
})

describe('errorChainSqlState', () => {
  it('reads the SQLSTATE from the driver error under a query wrapper', () => {
    const driver = Object.assign(new Error('duplicate key value'), { code: '23505' })
    const wrapped = new Error('Failed query: insert into "t" values ($1)', { cause: driver })

    expect(errorChainSqlState(wrapped)).toBe('23505')
  })

  it('ignores codes that are not SQLSTATEs and errors without a code', () => {
    const auth = Object.assign(new Error('session'), { code: 'refresh_token_not_found' })

    expect(errorChainSqlState(auth)).toBeUndefined()
    expect(errorChainSqlState(new Error('plain'))).toBeUndefined()
    expect(errorChainSqlState('not an error')).toBeUndefined()
  })
})
