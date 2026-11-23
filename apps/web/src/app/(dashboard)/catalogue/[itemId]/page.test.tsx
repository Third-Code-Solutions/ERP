import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCents } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  detail: vi.fn(),
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
  getCatalogueItemDetail: mocks.detail,
}))
vi.mock('../actions', () => ({ editCatalogueItem: vi.fn(), recordCataloguePrice: vi.fn() }))

import CatalogueItemPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const ITEM = {
  id: ITEM_ID,
  tenant_id: TENANT_ID,
  code: 'CN-0001',
  name: 'Portland cement, 40 kg bag',
  trade: 'concrete',
  specification: 'Type 1, ASTM C150',
  unit: 'bag',
  is_active: true,
  created_at: new Date('2026-11-05T00:00:00Z'),
  updated_at: new Date('2026-11-05T00:00:00Z'),
  created_by: null,
  updated_by: null,
}

function observation(overrides: Record<string, unknown>) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    tenant_id: TENANT_ID,
    item_id: ITEM_ID,
    region: 'NCR',
    price_low_centavos: 23000,
    price_avg_centavos: 24550,
    price_high_centavos: 26000,
    price_basis: 'material_supply;incl_VAT',
    source_kind: 'research',
    source_name: null,
    source_url: 'https://www.example.com/cement',
    vendor_id: null,
    checked_on: '2026-11-05',
    flag: 'SINGLE_SOURCE;LOW_AUTHORITY',
    notes: 'Shelf price read on the store page.',
    created_at: new Date('2026-11-05T00:00:00Z'),
    created_by: null,
    ...overrides,
  }
}

const NEWER = observation({
  id: '55555555-5555-4555-8555-555555555555',
  price_low_centavos: 25000,
  price_avg_centavos: 25000,
  price_high_centavos: 25000,
  source_kind: 'manual',
  source_name: 'Supplier quotation',
  source_url: null,
  checked_on: '2026-11-10',
  flag: null,
  notes: null,
})
const OLDER = observation({})
const NO_PRICE_NOTE =
  'No dated public rate was found: the only tables seen carry no date of their own and may copy a paid guide.'
// The research found no price: the observation has no amounts, but a flag and a note.
const NO_SOURCE = observation({
  id: '66666666-6666-4666-8666-666666666666',
  region: 'National',
  price_low_centavos: null,
  price_avg_centavos: null,
  price_high_centavos: null,
  source_url: null,
  checked_on: '2026-11-01',
  flag: 'NO_SOURCE',
  notes: NO_PRICE_NOTE,
})

function signIn(role: string) {
  mocks.profile.mockResolvedValue({ user: { id: 'user-1' }, tenantId: TENANT_ID, role })
}

async function render(itemId = ITEM_ID) {
  return renderToStaticMarkup(await CatalogueItemPage({ params: Promise.resolve({ itemId }) }))
}

describe('CatalogueItemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
    signIn('viewer')
    mocks.detail.mockResolvedValue({
      ok: true,
      data: {
        item: ITEM,
        history: [NEWER, OLDER, NO_SOURCE],
        historyCapped: false,
        current: [NEWER, NO_SOURCE],
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is not-found while the flag is off, whoever asks', async () => {
    vi.stubEnv('ERP_CATALOGUE_ENABLED', '')
    signIn('admin')

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.detail).not.toHaveBeenCalled()
  })

  it('refuses a role without catalogue.read before any query', async () => {
    signIn('finance')

    await expect(render()).rejects.toThrow('lacks capability "catalogue.read"')
    expect(mocks.detail).not.toHaveBeenCalled()
  })

  it('is not-found for an id that is not a UUID, before any query', async () => {
    await expect(render('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.detail).not.toHaveBeenCalled()
  })

  it('is not-found for a missing item or another tenant’s item', async () => {
    mocks.detail.mockResolvedValue({ ok: false, status: 404, error: 'Catalogue item not found' })

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.detail).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, role: 'viewer' }),
      ITEM_ID,
    )
  })

  it('shows the item and its price history in the order given, newest first', async () => {
    const html = await render()

    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="page-title">CN-0001</h1>')
    expect(html).toContain('<h2>Portland cement, 40 kg bag</h2>')
    expect(html).toContain('<strong>Trade</strong><span>Concrete</span>')
    expect(html).toContain('<strong>Unit</strong><span>bag</span>')
    expect(html).toContain('<strong>Specification</strong><span>Type 1, ASTM C150</span>')
    expect(html).toContain(
      '3 entries. In each region the current entry, marked Current, is the newest one with a price, or the newest one where no price was ever found there.',
    )

    // Same name as the record-price form's field.
    expect(html).toContain('<th>Checked date</th>')
    expect(html.indexOf('Nov 10, 2026')).toBeGreaterThan(-1)
    expect(html.indexOf('Nov 10, 2026')).toBeLessThan(html.indexOf('Nov 5, 2026'))
    expect(html).toContain('<span class="finance-cell-detail">Entered by hand</span>')
    expect(html).toContain('<td>Supplier quotation</td>')
    expect(html).toContain(`<td class="currency">${formatCents(24550)}</td>`)
    expect(html).toContain('<td>material supply · incl VAT</td>')
    expect(html).toContain(
      '<a href="https://www.example.com/cement" target="_blank" rel="noopener noreferrer">example.com',
    )
    expect(html).toContain('<span class="finance-status finance-status-draft">One source</span>')
    expect(html).toContain(
      '<span class="finance-status finance-status-maintenance">Low authority</span>',
    )
    expect(html).not.toContain('style=')
  })

  it('keeps an observation that found no price in the history, with its flag and its note in full', async () => {
    const html = await render()

    expect(NO_PRICE_NOTE.length).toBeGreaterThan(80)
    // The only entry in its region, so it is the current one there.
    expect(html).toContain(
      '<td>National <span class="finance-status finance-status-open">Current</span></td>',
    )
    expect(html.match(/<td class="currency">—<\/td>/g)).toHaveLength(3)
    expect(html).toContain('<span class="finance-status finance-status-draft">No source</span>')
    // In the cell itself, not in a hover title.
    expect(html).toContain(`<td>${NO_PRICE_NOTE}</td>`)
    expect(html).not.toContain(`title="${NO_PRICE_NOTE}"`)
  })

  it('marks in words the entry that is current in each region, and only that one', async () => {
    const html = await render()
    const rows = (html.split('<tbody>')[1] ?? '').split('<tr>').slice(1)
    const current = '<span class="finance-status finance-status-open">Current</span>'

    // NEWER, OLDER and NO_SOURCE in that order; NEWER and NO_SOURCE are current.
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain(`<td>NCR ${current}</td>`)
    expect(rows[1]).toContain('<td>NCR</td>')
    expect(rows[1]).not.toContain('>Current<')
    expect(rows[2]).toContain(`<td>National ${current}</td>`)
  })

  it('says so when only the newest entries are shown', async () => {
    mocks.detail.mockResolvedValue({
      ok: true,
      data: { item: ITEM, history: [NEWER, OLDER], historyCapped: true, current: [NEWER] },
    })

    const html = await render()

    expect(html).toContain('Only the newest 2 entries are shown; older ones are not listed here.')
    expect(html).not.toContain('2 entries.')
    expect(html).not.toContain('pinned at the top')
  })

  it('shows an unknown trade, flag or source kind as stored, even one named like an Object property', async () => {
    const odd = observation({ source_kind: 'constructor', flag: 'constructor;__proto__;toString' })
    mocks.detail.mockResolvedValue({
      ok: true,
      data: {
        item: { ...ITEM, trade: 'constructor' },
        history: [odd],
        historyCapped: false,
        current: [odd],
      },
    })

    const html = await render()

    expect(html).toContain('<strong>Trade</strong><span>constructor</span>')
    expect(html).toContain('<span class="finance-cell-detail">constructor</span>')
    for (const flag of ['constructor', '__proto__', 'toString']) {
      expect(html).toContain(`<span class="finance-status finance-status-draft">${flag}</span>`)
    }
    expect(html).not.toContain('function')
    expect(html).not.toContain('[object Object]')
  })

  it('pins a current entry older than the entries shown above them, marked Current', async () => {
    // NO_SOURCE is the current entry of "National" but fell outside the cap.
    mocks.detail.mockResolvedValue({
      ok: true,
      data: {
        item: ITEM,
        history: [NEWER, OLDER],
        historyCapped: true,
        current: [NEWER, NO_SOURCE],
      },
    })

    const html = await render()
    const rows = (html.split('<tbody>')[1] ?? '').split('<tr>').slice(1)
    const current = '<span class="finance-status finance-status-open">Current</span>'

    expect(html).toContain(
      'Only the newest 2 entries are shown; older ones are not listed here, except the current entry of a region, which is pinned at the top.',
    )
    // The pinned entry first, then the history newest first; nothing twice.
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain(`<td>National ${current}</td>`)
    expect(rows[0]).toContain(
      '<span class="finance-cell-detail">Older than the entries listed below</span>',
    )
    expect(rows[0]).toContain(`<td>${NO_PRICE_NOTE}</td>`)
    expect(rows[1]).toContain(`<td>NCR ${current}</td>`)
    expect(rows[1]).not.toContain('Older than the entries listed below')
    expect(rows[2]).toContain('<td>NCR</td>')
    expect(html.match(/Older than the entries listed below/g)).toHaveLength(1)
  })

  it('offers no form to a reader without catalogue.manage', async () => {
    const html = await render()

    expect(html).not.toContain('<form')
    expect(html).not.toContain('Record a price')
  })

  it('offers the edit and record-price forms to a role with catalogue.manage', async () => {
    signIn('commercial')

    const html = await render()

    expect(html).toContain('<h2>Edit item</h2>')
    expect(html).toContain(`<input type="hidden" name="id" value="${ITEM_ID}"/>`)
    expect(html).toContain('<h2>Record a price</h2>')
    expect(html).toContain(`<input type="hidden" name="item_id" value="${ITEM_ID}"/>`)
  })
})
