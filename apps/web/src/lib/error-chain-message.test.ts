import { describe, expect, it } from 'vitest'

import { errorChainMessage } from './error-chain-message'

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
