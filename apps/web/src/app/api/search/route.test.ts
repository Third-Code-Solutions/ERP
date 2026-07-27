import { describe, expect, it } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'
import { canSearchEntity } from './search-policy'

function allowed(role: AppRole) {
  const types = [
    'document',
    'task',
    'permit',
    'punchlist',
    'warranty',
    'delivery',
    'rfq',
  ] as const

  return types.filter((type) => canSearchEntity(role, type))
}

describe('universal search RBAC', () => {
  it('keeps tenant-wide documents and assignee-scoped tasks visible to every role', () => {
    expect(allowed('viewer')).toEqual(['document', 'task'])
  })

  it.each([
    ['procurement', ['document', 'task', 'delivery', 'rfq']],
    ['commercial', ['document', 'task', 'permit', 'rfq']],
    ['sd_pm_pe', ['document', 'task', 'permit', 'punchlist', 'delivery']],
    ['safety', ['document', 'task', 'permit', 'punchlist']],
    ['cx', ['document', 'task', 'punchlist', 'warranty']],
  ] satisfies Array<[AppRole, string[]]>)(
    'matches dashboard visibility for %s',
    (role, expected) => {
      expect(allowed(role)).toEqual(expected)
    }
  )

  it('allows admins to search every supported construction record', () => {
    expect(allowed('admin')).toEqual([
      'document',
      'task',
      'permit',
      'punchlist',
      'warranty',
      'delivery',
      'rfq',
    ])
    expect(allowed('owner')).toEqual(allowed('admin'))
  })

  it('keeps ledger accounts and journals finance-only', () => {
    expect(canSearchEntity('finance', 'ledger_account')).toBe(true)
    expect(canSearchEntity('finance', 'journal_entry')).toBe(true)
    expect(canSearchEntity('sales', 'ledger_account')).toBe(false)
    expect(canSearchEntity('viewer', 'journal_entry')).toBe(false)
    expect(canSearchEntity('admin', 'journal_entry')).toBe(true)
  })
})
