import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), selectDistinctOn: vi.fn() },
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))

import {
  CATALOGUE_HISTORY_LIMIT,
  CATALOGUE_MAX_PAGE,
  CATALOGUE_PAGE_SIZE,
  catalogueListFiltersSchema,
  escapeLikePattern,
  getCatalogueItemDetail,
  listCatalogueItems,
} from './queries'

const TENANT = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333'
const ITEM = '44444444-4444-4444-8444-444444444444'
const ESTIMATOR = { tenantId: TENANT, role: 'estimator' } as const
const FINANCE = { tenantId: TENANT, role: 'finance' } as const

interface Call {
  method: string
  args: unknown[]
}

/** A Drizzle-like builder: every method chains, awaiting it yields `result`. */
function chain(result: unknown): { builder: unknown; calls: Call[] } {
  const calls: Call[] = []
  const builder: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: unknown) => unknown) => resolve(result)
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args })
        return builder
      }
    },
  })
  return { builder, calls }
}

function argsOf(calls: Call[], method: string): unknown[] {
  const call = calls.find((entry) => entry.method === method)
  if (!call) throw new Error(`${method} was not called`)
  return call.args
}

function render(where: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(where as SQL)
}

function queueList(rows: unknown[], total: number) {
  const current = chain([])
  const list = chain(rows)
  const count = chain([{ count: total }])
  mocks.db.selectDistinctOn.mockReturnValueOnce(current.builder)
  mocks.db.select.mockReturnValueOnce(list.builder).mockReturnValueOnce(count.builder)
  return { current, list, count }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
})

describe('catalogue list filters', () => {
  it('escapes ILIKE wildcards in a search term', () => {
    expect(escapeLikePattern('50%_off\\x')).toBe('50\\%\\_off\\\\x')
    expect(escapeLikePattern('CN-0001')).toBe('CN-0001')
  })

  it('caps the term at 100 characters, cleans it and caps the page', () => {
    const parsed = catalogueListFiltersSchema.parse({
      q: ` cement\t${'x'.repeat(200)} `,
      trade: '',
      region: ' NCR ',
      status: 'stale',
      page: '999999',
    })

    expect(parsed.q).toHaveLength(100)
    expect(parsed.q?.startsWith('cement x')).toBe(true)
    expect(parsed).toMatchObject({ region: 'NCR', status: 'stale', page: CATALOGUE_MAX_PAGE })
    expect(parsed.trade).toBeUndefined()
    expect(catalogueListFiltersSchema.parse({}).page).toBe(1)
  })

  it.each([
    { trade: 'carpentry' },
    { status: 'expired' },
    { page: '0' },
    { page: 'abc' },
    { region: 'x'.repeat(41) },
  ])('rejects %j without querying', async (filters) => {
    const result = await listCatalogueItems(ESTIMATOR, filters)

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.selectDistinctOn).not.toHaveBeenCalled()
  })
})

describe('catalogue read gate', () => {
  it.each(['', 'false', '1', 'TRUE'])('is not found while ERP_CATALOGUE_ENABLED=%j', async (value) => {
    vi.stubEnv('ERP_CATALOGUE_ENABLED', value)

    expect(await listCatalogueItems(ESTIMATOR)).toEqual({
      ok: false,
      status: 404,
      error: 'Not found',
    })
    expect(await getCatalogueItemDetail(ESTIMATOR, ITEM)).toMatchObject({ ok: false, status: 404 })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.selectDistinctOn).not.toHaveBeenCalled()
  })

  it('is forbidden without catalogue.read, before any query', async () => {
    expect(await listCatalogueItems(FINANCE)).toMatchObject({ ok: false, status: 403 })
    expect(await getCatalogueItemDetail(FINANCE, ITEM)).toMatchObject({ ok: false, status: 403 })
    expect(mocks.db.select).not.toHaveBeenCalled()
  })
})

describe('listCatalogueItems', () => {
  const PRICED_ROW = {
    id: ITEM,
    code: 'CN-0001',
    name: 'Cement 40 kg',
    trade: 'concrete',
    specification: null,
    unit: 'bag',
    is_active: true,
    price_id: '55555555-5555-4555-8555-555555555555',
    region: 'NCR',
    price_low_centavos: 24_000,
    price_avg_centavos: 26_500,
    price_high_centavos: 28_000,
    price_basis: 'material_supply',
    source_kind: 'research',
    source_name: null,
    source_url: 'https://example.com/prices',
    checked_on: '2026-11-05',
    flag: 'SINGLE_SOURCE;STALE_2024',
    notes: null,
  }
  // The newest observation found no price: it still has a region, a flag and a note.
  const NO_SOURCE_ROW = {
    ...PRICED_ROW,
    code: 'CN-0002',
    price_id: '66666666-6666-4666-8666-666666666666',
    region: 'National',
    price_low_centavos: null,
    price_avg_centavos: null,
    price_high_centavos: null,
    source_url: null,
    flag: 'NO_SOURCE',
    notes: 'No retailer lists this size.',
  }
  // No observation at all.
  const UNPRICED_ROW = {
    ...PRICED_ROW,
    code: 'CN-0003',
    price_id: null,
    region: null,
    price_low_centavos: null,
    price_avg_centavos: null,
    price_high_centavos: null,
    price_basis: null,
    source_kind: null,
    source_url: null,
    checked_on: null,
    flag: null,
    notes: null,
  }

  it('pages 50 at a time and maps the current price and its flags', async () => {
    const { list } = queueList([PRICED_ROW, UNPRICED_ROW, NO_SOURCE_ROW], 120)

    const result = await listCatalogueItems(ESTIMATOR, { page: '3' })

    expect(result.ok && result.data).toMatchObject({
      total: 120,
      page: 3,
      limit: CATALOGUE_PAGE_SIZE,
      totalPages: 3,
    })
    expect(argsOf(list.calls, 'limit')).toEqual([50])
    expect(argsOf(list.calls, 'offset')).toEqual([100])
    const rows = result.ok ? result.data.rows : []
    expect(rows[0]?.price).toMatchObject({
      region: 'NCR',
      price_avg_centavos: 26_500,
      checked_on: '2026-11-05',
      flags: ['SINGLE_SOURCE', 'STALE_2024'],
    })
    expect(rows[1]?.price).toBeNull()
    expect(rows[2]?.price).toEqual({
      id: NO_SOURCE_ROW.price_id,
      region: 'National',
      price_low_centavos: null,
      price_avg_centavos: null,
      price_high_centavos: null,
      price_basis: 'material_supply',
      source_kind: 'research',
      source_name: null,
      source_url: null,
      checked_on: '2026-11-05',
      flags: ['NO_SOURCE'],
      notes: 'No retailer lists this size.',
    })
  })

  it('scopes the items, the current-price subquery and the count to the caller tenant', async () => {
    const { current, list, count } = queueList([], 0)

    const result = await listCatalogueItems(ESTIMATOR, { q: '50%_off', trade: 'concrete', region: 'NCR' })

    expect(result.ok && result.data.totalPages).toBe(1)
    const prices = render(argsOf(current.calls, 'where')[0])
    expect(prices.sql).toContain('"catalogue_prices"."tenant_id" =')
    // The region is compared lower-cased on both sides.
    expect(prices.sql).toContain('lower("catalogue_prices"."region") =')
    expect(prices.params).toEqual([TENANT, 'ncr'])

    const items = render(argsOf(list.calls, 'where')[0])
    expect(items.sql).toContain('"catalogue_items"."tenant_id" =')
    expect(items.sql).toMatch(/"code" ilike \$\d+ or .*"name" ilike \$\d+/)
    expect(items.params.slice(0, 4)).toEqual([TENANT, '%50\\%\\_off%', '%50\\%\\_off%', 'concrete'])
    // The region filter also requires an observation in that region (on the
    // fake subquery its column renders as a parameter).
    expect(items.sql).toMatch(/ is not null\)$/)
    expect(items.params).not.toContain(OTHER_TENANT)
    expect(argsOf(count.calls, 'where')[0]).toBe(argsOf(list.calls, 'where')[0])
  })
})

describe('getCatalogueItemDetail', () => {
  it('reads another tenant\'s item as not found and never loads its prices', async () => {
    const item = chain([])
    mocks.db.select.mockReturnValueOnce(item.builder)

    const result = await getCatalogueItemDetail({ tenantId: OTHER_TENANT, role: 'admin' }, ITEM)

    expect(result).toEqual({ ok: false, status: 404, error: 'Catalogue item not found' })
    expect(render(argsOf(item.calls, 'where')[0]).params).toEqual([ITEM, OTHER_TENANT])
    expect(mocks.db.select).toHaveBeenCalledTimes(1)
  })

  it('treats a malformed id as not found without querying', async () => {
    expect(await getCatalogueItemDetail(ESTIMATOR, "1' or '1'='1")).toMatchObject({ status: 404 })
    expect(mocks.db.select).not.toHaveBeenCalled()
  })

  it('returns the history newest first with the current price per region', async () => {
    const observation = (id: string, region: string, checked_on: string) => ({
      id,
      region,
      checked_on,
      created_at: new Date(`${checked_on}T00:00:00Z`),
    })
    const history = [
      observation('ncr-new', 'NCR', '2026-11-05'),
      observation('cebu', 'Region VII', '2026-06-01'),
      observation('ncr-old', 'NCR', '2026-01-10'),
    ]
    const item = chain([{ id: ITEM, tenant_id: TENANT, code: 'CN-0001' }])
    const prices = chain(history)
    mocks.db.select.mockReturnValueOnce(item.builder).mockReturnValueOnce(prices.builder)

    const result = await getCatalogueItemDetail(ESTIMATOR, ITEM)

    expect(result.ok && result.data.history).toEqual(history)
    expect(result.ok && result.data.historyCapped).toBe(false)
    expect(result.ok && result.data.current.map((price) => price.id)).toEqual(['ncr-new', 'cebu'])
    expect(render(argsOf(prices.calls, 'where')[0]).params).toEqual([ITEM, TENANT])
  })

  it('keeps the newest observations up to the cap and says when older ones were left out', async () => {
    const stored = Array.from({ length: CATALOGUE_HISTORY_LIMIT + 1 }, (_, index) => ({
      id: `price-${index}`,
      region: 'NCR',
      checked_on: '2026-11-05',
      created_at: new Date(Date.UTC(2026, 10, 5) - index),
    }))
    const item = chain([{ id: ITEM, tenant_id: TENANT, code: 'CN-0001' }])
    const prices = chain(stored)
    mocks.db.select.mockReturnValueOnce(item.builder).mockReturnValueOnce(prices.builder)

    const result = await getCatalogueItemDetail(ESTIMATOR, ITEM)

    expect(argsOf(prices.calls, 'limit')).toEqual([CATALOGUE_HISTORY_LIMIT + 1])
    expect(result.ok && result.data.history).toEqual(stored.slice(0, CATALOGUE_HISTORY_LIMIT))
    expect(result.ok && result.data.historyCapped).toBe(true)
  })
})
