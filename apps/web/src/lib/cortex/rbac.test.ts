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
  })

  it('viewer sees only the everyone surfaces (documents, tasks)', () => {
    const v = cortexNodeTypeScope('viewer')!
    expect(v).toContain('document')
    expect(v).toContain('task')
    expect(v).not.toContain('invoice')
    expect(v).not.toContain('opportunity')
    expect(v).not.toContain('employee')
  })

  it('cortexCanSeeType gates per role', () => {
    expect(cortexCanSeeType('admin', 'invoice')).toBe(true) // unrestricted
    expect(cortexCanSeeType('sales', 'invoice')).toBe(false)
    expect(cortexCanSeeType('finance', 'invoice')).toBe(true)
    expect(cortexCanSeeType('sales', 'opportunity')).toBe(true)
    // unmapped types are not hidden (keep the map current)
    expect(cortexCanSeeType('sales', 'some_future_type')).toBe(true)
  })
})
