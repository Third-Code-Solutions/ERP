import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The real Drizzle builder against a fake postgres.js client: checks the SQL
 * the catalogue reads send (tenant predicates above all) without a database.
 */
const fake = vi.hoisted(() => {
  const statements: Array<{ sql: string; params: unknown[] }> = []
  /** Raw rows (arrays of column values) for the next statements, in order. */
  const replies: unknown[][][] = []
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe(sql: string, params: unknown[] = []) {
      statements.push({ sql, params })
      const reply = replies.shift() ?? []
      const rows = Promise.resolve([])
      return Object.assign(rows, { values: () => Promise.resolve(reply) })
    },
  }
  return { statements, replies, client }
})

vi.mock('@third-code-erp/database', async () => {
  const { drizzle } = await import('drizzle-orm/postgres-js')
  return { db: drizzle({ client: fake.client as never }) }
})

import { getCatalogueItemDetail, listCatalogueItems } from './queries'

const TENANT = '22222222-2222-4222-8222-222222222222'
const ITEM = '44444444-4444-4444-8444-444444444444'
const ACTOR = { tenantId: TENANT, role: 'estimator' } as const

beforeEach(() => {
  fake.statements.length = 0
  fake.replies.length = 0
  vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
})

describe('catalogue read SQL', () => {
  it('lists with a tenant predicate on the items, on the current-price subquery and on the join', async () => {
    const result = await listCatalogueItems(ACTOR, {
      q: '100%_pure',
      trade: 'paint',
      region: ' Ncr ',
      status: 'stale',
      page: '2',
    })

    expect(result.ok).toBe(true)
    expect(fake.statements).toHaveLength(2)
    const [list, count] = fake.statements as [
      { sql: string; params: unknown[] },
      { sql: string; params: unknown[] },
    ]
    for (const statement of [list, count]) {
      // One observation per item and region inside the caller's tenant: priced
      // ones first (`is null` sorts false before true), then the newest.
      expect(statement.sql).toMatch(
        /select distinct on \("catalogue_prices"\."item_id", lower\(trim\("catalogue_prices"\."region"\)\)\)/,
      )
      expect(statement.sql).toMatch(
        /from "catalogue_prices" where \("catalogue_prices"\."tenant_id" = \$\d+ and lower\(trim\("catalogue_prices"\."region"\)\) = lower\(trim\(\$\d+\)\)\) order by "catalogue_prices"\."item_id", lower\(trim\("catalogue_prices"\."region"\)\), "catalogue_prices"\."price_avg_centavos" is null, "catalogue_prices"\."checked_on" desc, "catalogue_prices"\."created_at" desc\) "current_price"/,
      )
      expect(statement.sql).toMatch(
        /on \("current_price"\."item_id" = "catalogue_items"\."id" and "current_price"\."tenant_id" = "catalogue_items"\."tenant_id"\)/,
      )
      expect(statement.sql).toMatch(/where \("catalogue_items"\."tenant_id" = \$\d+ and /)
      expect(statement.sql).toMatch(/"current_price"\."flag" ~ \$\d+/)
      // A region filter keeps only the items observed in that region.
      expect(statement.sql).toMatch(/"current_price"\."id" is not null/)
      expect(statement.params.slice(0, 7)).toEqual([
        TENANT,
        // Cleaned; Postgres lower-cases and trims both sides.
        'Ncr',
        TENANT,
        '%100\\%\\_pure%',
        '%100\\%\\_pure%',
        'paint',
        '(^|;)STALE_[0-9]{4}(;|$)',
      ])
    }
    // An observation without a price is still current: its flag and note are read.
    expect(list.sql).toContain('"current_price"."flag"')
    expect(list.sql).toContain('"current_price"."notes"')
    expect(list.sql).toMatch(/order by "catalogue_items"\."code" asc, "current_price"\."region" asc limit \$\d+ offset \$\d+$/)
    expect(list.params.slice(7)).toEqual([50, 50])
    expect(count.sql).toMatch(/^select count\(\*\)::int from "catalogue_items" left join/)
  })

  it.each([
    ['priced', /"current_price"\."price_avg_centavos" is not null/],
    ['no_source', /"current_price"\."price_avg_centavos" is null/],
    ['low_authority', /"current_price"\."flag" ~ \$\d+/],
  ])('filters the %s status on the current price', async (status, condition) => {
    await listCatalogueItems(ACTOR, { status })

    expect(fake.statements[0]?.sql).toMatch(condition)
    // No region filter: the subquery is still tenant-scoped.
    expect(fake.statements[0]?.sql).toMatch(
      /from "catalogue_prices" where "catalogue_prices"\."tenant_id" = \$1 order by/,
    )
    expect(fake.statements[0]?.params[0]).toBe(TENANT)
    expect(fake.statements[0]?.sql).not.toContain('"current_price"."id" is not null')
  })

  it('lists the items not observed in a region as "no source" there', async () => {
    await listCatalogueItems(ACTOR, { region: 'Cebu', status: 'no_source' })

    const [list] = fake.statements
    expect(list?.sql).toMatch(/lower\(trim\("catalogue_prices"\."region"\)\) = lower\(trim\(\$2\)\)/)
    expect(list?.params.slice(0, 2)).toEqual([TENANT, 'Cebu'])
    // No observation there leaves a null price: the left join keeps the item.
    expect(list?.sql).toMatch(/"current_price"\."price_avg_centavos" is null/)
    expect(list?.sql).not.toContain('"current_price"."id" is not null')
  })

  it('reads an item and its history by id and tenant, newest first', async () => {
    const result = await getCatalogueItemDetail(ACTOR, ITEM)

    // The fake database holds nothing, so the item is not found and the
    // history is never requested.
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(fake.statements).toHaveLength(1)
    expect(fake.statements[0]?.sql).toMatch(
      /from "catalogue_items" where \("catalogue_items"\."id" = \$1 and "catalogue_items"\."tenant_id" = \$2\) limit \$3$/,
    )
    expect(fake.statements[0]?.params).toEqual([ITEM, TENANT, 1])
  })

  it('reads the current entry per region from every observation, apart from the capped history', async () => {
    fake.replies.push([[ITEM, TENANT, 'CN-0001']])

    const result = await getCatalogueItemDetail(ACTOR, ITEM)

    expect(result.ok).toBe(true)
    expect(fake.statements).toHaveLength(3)
    // After the item: the history and the current entries, read side by side.
    const prices = fake.statements.slice(1)
    const history = prices.find((statement) => !statement.sql.includes('distinct on'))
    const current = prices.find((statement) => statement.sql.includes('distinct on'))
    expect(history?.sql).toMatch(/limit \$3$/)
    expect(history?.params).toEqual([ITEM, TENANT, 501])
    // One row per region in any letter case, priced before unpriced, then the
    // newest; scoped to the item and the tenant, and never capped.
    expect(current?.sql).toMatch(
      /^select distinct on \(lower\(trim\("catalogue_prices"\."region"\)\)\) .* from "catalogue_prices" where \("catalogue_prices"\."item_id" = \$1 and "catalogue_prices"\."tenant_id" = \$2\) order by lower\(trim\("catalogue_prices"\."region"\)\), "catalogue_prices"\."price_avg_centavos" is null, "catalogue_prices"\."checked_on" desc, "catalogue_prices"\."created_at" desc$/,
    )
    expect(current?.params).toEqual([ITEM, TENANT])
  })
})
