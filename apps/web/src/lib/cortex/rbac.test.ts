import { describe, it, expect } from 'vitest'
import { cortexNodeTypeScope, cortexCanSeeType } from './rbac'

describe('Cortex RBAC — node-type scope', () => {
  it('admin and owner are unrestricted (null = no filter)', () => {
    expect(cortexNodeTypeScope('admin')).toBeNull()
    expect(cortexNodeTypeScope('owner')).toBeNull() // legacy → admin
  })

  it('sales sees pipeline / CRM / projects, NOT finance or people', () => {
    const s = cortexNodeTypeScope('sales')!
    expect(s).toContain('opportunity')
    expect(s).toContain('account')
    expect(s).toContain('project')
    expect(s).not.toContain('invoice')
    expect(s).not.toContain('claim')
    expect(s).not.toContain('employee')
    expect(s).not.toContain('bom')
  })

  it('finance sees invoices + claims', () => {
    const f = cortexNodeTypeScope('finance')!
    expect(f).toContain('invoice')
    expect(f).toContain('claim')
    expect(f).toContain('journal_entry')
    expect(f).toContain('journal_line')
    expect(f).toContain('ledger_account')
    expect(f).toContain('bank_statement')
    expect(f).toContain('cost_code')
    expect(f).toContain('project_budget')
    expect(f).toContain('stock_movement')
  })

  it('covers nested estimating and procurement records', () => {
    expect(cortexCanSeeType('estimator', 'bom_line')).toBe(true)
    expect(cortexCanSeeType('estimator', 'warehouse')).toBe(false)
    expect(cortexCanSeeType('estimator', 'employee')).toBe(false)
    expect(cortexCanSeeType('procurement', 'po_line')).toBe(true)
    expect(cortexCanSeeType('sales', 'bom_line')).toBe(false)
    expect(cortexCanSeeType('sales', 'po_line')).toBe(false)
  })

  it('sales cannot see finance ledger nodes', () => {
    const s = cortexNodeTypeScope('sales')!
    expect(s).not.toContain('journal_entry')
    expect(s).not.toContain('journal_line')
    expect(s).not.toContain('ledger_account')
    expect(s).not.toContain('bank_statement')
    expect(cortexCanSeeType('sales', 'journal_entry')).toBe(false)
    expect(cortexCanSeeType('finance', 'journal_entry')).toBe(true)
  })

  it('viewer sees every registered read surface without inheriting future types', () => {
    const v = cortexNodeTypeScope('viewer')!
    expect(v).toContain('document')
    expect(v).toContain('task')
    expect(v).toContain('opportunity')
    expect(v).toContain('project')
    expect(v).toContain('bom')
    expect(v).toContain('invoice')
    expect(v).toContain('claim')
    expect(v).toContain('journal_entry')
    expect(v).toContain('bank_statement')
    expect(v).toContain('employee')
    expect(cortexCanSeeType('viewer', 'some_future_type')).toBe(false)
  })

  it('cortexCanSeeType gates per role', () => {
    expect(cortexCanSeeType('admin', 'invoice')).toBe(true) // unrestricted
    expect(cortexCanSeeType('sales', 'invoice')).toBe(false)
    expect(cortexCanSeeType('finance', 'invoice')).toBe(true)
    expect(cortexCanSeeType('sales', 'opportunity')).toBe(true)
    // New types must be intentionally mapped before non-admin users can see them.
    expect(cortexCanSeeType('sales', 'some_future_type')).toBe(false)
    expect(cortexCanSeeType('admin', 'some_future_type')).toBe(true)
  })
})
