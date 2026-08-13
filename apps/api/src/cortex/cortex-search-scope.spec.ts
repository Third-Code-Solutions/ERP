import { describe, expect, it } from 'vitest'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

describe('Cortex search role scope', () => {
  it('keeps owner/admin unrestricted and all other roles bounded', () => {
    expect(cortexSearchNodeTypeScope('admin')).toBeNull()
    expect(cortexSearchNodeTypeScope('owner')).toBeNull()
    expect(cortexSearchNodeTypeScope('viewer')).toEqual([
      'task',
      'announcement',
      'document',
    ])
  })

  it('prevents non-finance roles from retrieving finance ledger nodes', () => {
    const sales = cortexSearchNodeTypeScope('sales')!
    const finance = cortexSearchNodeTypeScope('finance')!

    expect(sales).toContain('opportunity')
    expect(sales).toContain('project')
    expect(sales).not.toContain('invoice')
    expect(sales).not.toContain('journal_entry')
    expect(finance).toContain('invoice')
    expect(finance).toContain('journal_entry')
    expect(finance).toContain('ledger_account')
  })
})
