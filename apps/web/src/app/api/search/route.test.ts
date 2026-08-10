import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  universalSearchReadsUseCoreApi: vi.fn(),
  searchUniversalThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {},
}))

vi.mock('@/lib/erp-core-client', () => ({
  universalSearchReadsUseCoreApi: mocks.universalSearchReadsUseCoreApi,
  searchUniversalThroughCoreApi: mocks.searchUniversalThroughCoreApi,
}))

import {
  canSearchEntity,
  literalSearchPattern,
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchQuery,
} from './search-policy'
import { GET } from './route'
import { universalSearchResultFromSettled } from './search-result'

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
    mocks.universalSearchReadsUseCoreApi.mockReset()
    mocks.searchUniversalThroughCoreApi.mockReset()
    mocks.universalSearchReadsUseCoreApi.mockReturnValue(false)
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
      status: 'complete',
      failedTypes: [],
      hint: 'Type at least 2 characters.',
    })
    expect(shortQuery.headers.get('cache-control')).toContain('no-store')
  })

  it('uses selected Core authority without falling back to browser-side fan-out', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    mocks.getUserProfile.mockResolvedValueOnce({
      role: 'finance',
      tenantId,
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
    mocks.universalSearchReadsUseCoreApi.mockReturnValueOnce(true)
    mocks.searchUniversalThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: {
        hits: [
          {
            type: 'project',
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Harbor fit-out',
            href: '/projects/33333333-3333-4333-8333-333333333333',
          },
        ],
        status: 'complete',
        failedTypes: [],
      },
    })

    const result = await GET(
      new NextRequest('http://localhost/api/search?q=harbor')
    )

    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({
      hits: [
        {
          type: 'project',
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Harbor fit-out',
          href: '/projects/33333333-3333-4333-8333-333333333333',
        },
      ],
      status: 'complete',
      failedTypes: [],
    })
    expect(mocks.searchUniversalThroughCoreApi).toHaveBeenCalledWith('harbor')
  })

  it('returns selected-Core failure instead of silently using direct database reads', async () => {
    mocks.getUserProfile.mockResolvedValueOnce({
      role: 'viewer',
      tenantId: '22222222-2222-4222-8222-222222222222',
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
    mocks.universalSearchReadsUseCoreApi.mockReturnValueOnce(true)
    mocks.searchUniversalThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: 'Universal search service is unavailable.',
    })

    const result = await GET(
      new NextRequest('http://localhost/api/search?q=harbor')
    )

    expect(result.status).toBe(503)
    expect(await result.json()).toEqual({
      hits: [],
      status: 'complete',
      failedTypes: [],
      hint: 'Universal search service is unavailable.',
    })
    expect(mocks.searchUniversalThroughCoreApi).toHaveBeenCalledWith('harbor')
  })
})

describe('universal search partial-result contract', () => {
  it('reports failed record types without leaking query diagnostics', () => {
    const result = universalSearchResultFromSettled(
      [
        { type: 'project' },
        { type: 'invoice' },
      ],
      [
        {
          status: 'fulfilled',
          value: [
            {
              type: 'project',
              id: '33333333-3333-4333-8333-333333333333',
              title: 'Harbor fit-out',
              href: '/projects/33333333-3333-4333-8333-333333333333',
            },
          ],
        },
        { status: 'rejected', reason: new Error('database details') },
      ]
    )

    expect(result).toEqual({
      hits: [
        {
          type: 'project',
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Harbor fit-out',
          href: '/projects/33333333-3333-4333-8333-333333333333',
        },
      ],
      status: 'partial',
      failedTypes: ['invoice'],
    })
  })
})
