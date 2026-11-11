import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCents } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  list: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({ db: {} }))
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  notFound: mocks.notFound,
}))
vi.mock('@/lib/catalogue/queries', async (original) => ({
  ...(await original<typeof import('@/lib/catalogue/queries')>()),
  listCatalogueItems: mocks.list,
}))

import CataloguePage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const UNPRICED_ID = '33333333-3333-4333-8333-333333333333'
const SPECIFICATION =
  'Type 1 ordinary Portland cement to ASTM C150, in 40 kg bags, delivered to site in Metro Manila on pallets.'

function signIn(role: string) {
  mocks.profile.mockResolvedValue({ user: { id: 'user-1' }, tenantId: TENANT_ID, role })
}

function listed(rows: unknown[], overrides: Record<string, unknown> = {}) {
  mocks.list.mockResolvedValue({
    ok: true,
    data: {
      rows,
      total: rows.length,
      page: 1,
      limit: 50,
      totalPages: 1,
      filters: { page: 1 },
      ...overrides,
    },
  })
}

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await CataloguePage({ searchParams: Promise.resolve(searchParams) }))
}

const PRICED_ROW = {
  id: ITEM_ID,
  code: 'CN-0001',
  name: 'Portland cement, 40 kg bag',
  trade: 'concrete',
  specification: SPECIFICATION,
  unit: 'bag',
  is_active: true,
  price: {
    id: '44444444-4444-4444-8444-444444444444',
    region: 'NCR',
    price_low_centavos: 23000,
    price_avg_centavos: 24550,
    price_high_centavos: 123450,
    price_basis: 'material_supply;incl_VAT',
    source_kind: 'research',
    source_name: null,
    source_url: 'https://www.example.com/cement?size=40',
    checked_on: '2026-11-05',
    flags: ['SINGLE_SOURCE', 'STALE_2024'],
    notes: null,
  },
}
const NO_PRICE_NOTE =
  'No dated public rate was found: the only tables seen carry no date of their own and may copy a paid guide.'
// Its newest observation found no price: the region, flag, note and date are real.
const NO_SOURCE_ROW = {
  id: UNPRICED_ID,
  code: 'EQ-0007',
  name: 'Tower crane rental',
  trade: 'equipment',
  specification: null,
  unit: 'month',
  is_active: false,
  price: {
    ...PRICED_ROW.price,
    id: '55555555-5555-4555-8555-555555555555',
    region: 'National',
    price_low_centavos: null,
    price_avg_centavos: null,
    price_high_centavos: null,
    source_url: null,
    checked_on: '2026-11-10',
    flags: ['NO_SOURCE'],
    notes: NO_PRICE_NOTE,
  },
}
// Nothing was ever recorded for this one.
const UNOBSERVED_ROW = {
  ...NO_SOURCE_ROW,
  id: '66666666-6666-4666-8666-666666666666',
  code: 'SUP-12',
  price: null,
}

describe('CataloguePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
    signIn('estimator')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is not-found while the flag is off, whoever asks', async () => {
    vi.stubEnv('ERP_CATALOGUE_ENABLED', 'false')
    signIn('admin')

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('refuses a role without catalogue.read before any query', async () => {
    signIn('finance')

    await expect(render()).rejects.toThrow('lacks capability "catalogue.read"')
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('asks for the filters to be reviewed and runs no query when they do not parse', async () => {
    const html = await render({ trade: 'not-a-trade' })

    expect(mocks.list).not.toHaveBeenCalled()
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<strong>Filters need review</strong>')
    expect(html).toContain('<a href="/catalogue">Reset filters</a>')
  })

  it('queries with the parsed search state of the signed-in tenant', async () => {
    listed([])

    const html = await render({ q: ' cement ', trade: 'concrete', status: 'stale', page: '2' })

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, role: 'estimator' }),
      { q: 'cement', trade: 'concrete', region: undefined, status: 'stale', page: 2 },
    )
    expect(html).toContain('No catalogue items match current filters.')
    expect(html).toContain('<a href="/catalogue">Clear filters</a>')
  })

  it('lists each item with its current price, source link and worded flags', async () => {
    listed([PRICED_ROW])

    const html = await render()

    expect(html).toContain(`<a href="/catalogue/${ITEM_ID}"><strong>CN-0001</strong></a>`)
    expect(html).toContain('<span class="finance-cell-detail">Portland cement, 40 kg bag</span>')
    expect(html).toContain('<td>Concrete</td>')
    expect(html).toContain(`title="${SPECIFICATION}"`)
    expect(html).toContain('<th class="numeric">Average</th>')
    expect(html).toContain(`<td class="currency">${formatCents(23000)}</td>`)
    expect(html).toContain(`<td class="currency">${formatCents(24550)}</td>`)
    expect(html).toContain(`<td class="currency">${formatCents(123450)}</td>`)
    expect(html).toContain(
      '<a href="https://www.example.com/cement?size=40" target="_blank" rel="noopener noreferrer">example.com',
    )
    expect(html).toContain('<td>Nov 5, 2026</td>')
    expect(html).toContain('<span class="finance-status finance-status-draft">One source</span>')
    expect(html).toContain(
      '<span class="finance-status finance-status-maintenance" title="Newest figure found is from 2024">Before 2026</span>',
    )
    expect(html).not.toContain('>No source</span>')
    expect(html).not.toContain('style=')
  })

  it('shows why an item has no price where the amounts would be, with its real flag', async () => {
    listed([NO_SOURCE_ROW])

    const html = await render()

    // The note is cut for the table; the item page, one click away, has it in full.
    expect(html).toContain(`<td colSpan="3"><span title="${NO_PRICE_NOTE}">No dated public rate`)
    expect(html).not.toContain('class="currency"')
    expect(html).toContain('<td>National</td>')
    expect(html).toContain('<td>Nov 10, 2026</td>')
    expect(html).toContain('<span class="finance-status finance-status-draft">No source</span>')
    expect(html).toContain('<span class="finance-status finance-status-closed">Inactive</span>')
  })

  it('claims no flag for an item nothing was ever recorded for', async () => {
    listed([UNOBSERVED_ROW])

    const html = await render()

    expect(html).toContain('<strong>SUP-12</strong>')
    expect(html).toContain('<td colSpan="3">—</td>')
    expect(html).not.toContain('>No source</span>')
  })

  it('does not link a stored source that is not a plain web address', async () => {
    listed([
      {
        ...PRICED_ROW,
        price: { ...PRICED_ROW.price, source_url: 'javascript:alert(1)', source_name: 'A supplier' },
      },
    ])

    const html = await render()

    expect(html).not.toContain('javascript:')
    expect(html).toContain('<td>A supplier</td>')
  })

  it('pages with previous and next links that keep the search state', async () => {
    listed([PRICED_ROW], {
      total: 120,
      page: 2,
      totalPages: 3,
      filters: { q: 'cement', trade: 'concrete', page: 2 },
    })

    const html = await render({ q: 'cement', trade: 'concrete', page: '2' })

    expect(html).toContain('aria-label="Price catalogue pagination"')
    expect(html).toContain('<strong>Page 2 of 3</strong>')
    expect(html).toContain('<span>120 rows · 50 per page</span>')
    expect(html).toContain(
      '<a class="finance-secondary-link" href="/catalogue?q=cement&amp;trade=concrete&amp;page=1">Previous</a>',
    )
    expect(html).toContain(
      '<a class="finance-secondary-link" href="/catalogue?q=cement&amp;trade=concrete&amp;page=3">Next</a>',
    )
  })

  it('shows no previous or next link on a single page', async () => {
    listed([PRICED_ROW])

    const html = await render()

    expect(html).toContain('<strong>Page 1 of 1</strong>')
    expect(html).not.toContain('>Previous<')
    expect(html).not.toContain('>Next<')
  })
})
