import { describe, expect, it } from 'vitest'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

describe('Cortex search role scope', () => {
  it('keeps owner/admin unrestricted and all other roles bounded', () => {
    expect(cortexSearchNodeTypeScope('admin')).toBeNull()
    expect(cortexSearchNodeTypeScope('owner')).toBeNull()
    const viewer = cortexSearchNodeTypeScope('viewer')
    expect(viewer).not.toBeNull()
    expect(viewer).toHaveLength(48)
    expect(viewer).toEqual(expect.arrayContaining([
      'project',
      'document',
      'invoice',
      'journal_entry',
      'warehouse',
      'audit_event',
    ]))
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
