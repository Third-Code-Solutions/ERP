import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MappingSummary } from './mapping-summary'

const accounts = [
  { id: 'a-1', code: '1200', name: 'Trade receivables' },
  { id: 'a-2', code: '4000', name: 'Contract revenue' },
]
const mappings = [
  { key: 'accounts_receivable', label: 'Accounts Receivable' },
  { key: 'revenue', label: 'Revenue' },
]

describe('MappingSummary', () => {
  it('shows the mapped account beside each control account', () => {
    const html = renderToStaticMarkup(
      <MappingSummary
        mappings={mappings}
        accounts={accounts}
        current={{ accounts_receivable: 'a-1', revenue: 'a-2' }}
      />
    )
    expect(html).toContain('Accounts Receivable')
    expect(html).toContain('1200 · Trade receivables')
    expect(html).toContain('4000 · Contract revenue')
    expect(html).not.toContain('Not mapped yet')
  })

  it('says so when a control account is not mapped or its account is gone', () => {
    const html = renderToStaticMarkup(
      <MappingSummary
        mappings={mappings}
        accounts={accounts}
        current={{ accounts_receivable: 'a-1', revenue: 'inactive-id' }}
      />
    )
    expect(html).toContain('1200 · Trade receivables')
    expect(html.match(/Not mapped yet/g)).toHaveLength(1)
  })
})
