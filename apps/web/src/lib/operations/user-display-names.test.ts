import { describe, expect, it, vi } from 'vitest'

vi.mock('@third-code-erp/database', () => ({ db: {} }))

import { applyUserDisplayNames, UNKNOWN_USER_LABEL } from './user-display-names'

describe('applyUserDisplayNames', () => {
  it('swaps known ids for names, unknown ids for a neutral label, and keeps nulls', () => {
    const rows = [{ id: 'r1', createdBy: 'u1', submittedBy: 'u2' as string | null }, { id: 'r2', createdBy: 'u1', submittedBy: null }]
    const result = applyUserDisplayNames(rows, ['createdBy', 'submittedBy'], new Map([['u1', 'Ana Cruz']]))
    expect(result).toEqual([
      { id: 'r1', createdBy: 'Ana Cruz', submittedBy: UNKNOWN_USER_LABEL },
      { id: 'r2', createdBy: 'Ana Cruz', submittedBy: null },
    ])
    expect(rows[0]?.createdBy).toBe('u1')
  })
})
