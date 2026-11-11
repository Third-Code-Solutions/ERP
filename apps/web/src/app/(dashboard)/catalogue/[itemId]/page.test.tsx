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
      data: { item: ITEM, history: [NEWER, OLDER], current: [NEWER] },
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
    expect(html).toContain('2 recorded prices')

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
