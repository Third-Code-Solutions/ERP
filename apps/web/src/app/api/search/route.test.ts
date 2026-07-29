import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {},
}))

import {
  canSearchEntity,
  literalSearchPattern,
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchQuery,
} from './search-policy'
import { GET } from './route'

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

describe('universal search request hardening', () => {
  beforeEach(() => {
    mocks.getUserProfile.mockReset()
  })

  it('trims and bounds user input before query fan-out', () => {
    expect(normalizeSearchQuery('  concrete  ')).toBe('concrete')
    expect(normalizeSearchQuery('x'.repeat(150))).toHaveLength(
      MAX_SEARCH_QUERY_LENGTH
    )
    expect(normalizeSearchQuery(null)).toBe('')
  })

  it('treats PostgreSQL wildcard and escape characters as literal text', () => {
    expect([...literalSearchPattern('50%_\\')]).toEqual([
      '%',
      '5',
      '0',
      '\\',
      '%',
      '\\',
      '_',
      '\\',
      '\\',
      '%',
    ])
  })

  it('marks unauthenticated and short-query responses private and non-cacheable', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    const unauthenticated = await GET(
      new NextRequest('http://localhost/api/search?q=project')
    )

    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('cache-control')).toContain('private')
    expect(unauthenticated.headers.get('cache-control')).toContain('no-store')
    expect(unauthenticated.headers.get('vary')).toBe('Cookie')

    mocks.getUserProfile.mockResolvedValueOnce({
      role: 'viewer',
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    })
    const shortQuery = await GET(
      new NextRequest('http://localhost/api/search?q=%20x%20')
    )

    expect(shortQuery.status).toBe(200)
    expect(await shortQuery.json()).toEqual({
      hits: [],
      hint: 'Type at least 2 characters.',
    })
    expect(shortQuery.headers.get('cache-control')).toContain('no-store')
  })
})
