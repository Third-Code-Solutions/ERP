/**
 * Master price catalogue (docs/erp/specs/catalogue.md): catalogue_items and
 * the append-only catalogue_prices.
 *
 * The static block checks the migration text and always runs. The database
 * block needs DATABASE_URL (a local, disposable database) and proves the
 * constraints, the tenant-scoped foreign keys, that browser roles can neither
 * read nor write, that RLS still isolates tenants if a SELECT grant is ever
 * restored, that prices are append-only and that the seed is idempotent.
 * Every probe runs inside a transaction that is rolled back.
 */
import { readFileSync } from 'node:fs'

import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  becomeAuthenticated,
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
  type TwoTenants,
} from './_db-harness'

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/20261110100000_catalogue_price_book.sql',
    import.meta.url
  ),
  'utf8'
)
const executable = migration
  .replace(/--[^\r\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('catalogue price book migration', () => {
  it('is one bounded, additive transaction', () => {
    expect(executable.startsWith('begin;')).toBe(true)
    expect(executable.endsWith('commit;')).toBe(true)
    expect(executable).toContain("set local lock_timeout = '5s';")
    expect(executable).toContain("set local statement_timeout = '60s';")
    expect(executable).not.toMatch(
      /\bdrop\b|\brename\b|\btruncate\b|delete from|alter column|alter type|update public\./
    )
  })

  it('installs pg_trgm in the extensions schema and indexes name, trade and code', () => {
    expect(executable).toContain('create extension if not exists pg_trgm with schema extensions;')
    expect(executable).toContain(
      'create unique index if not exists ux_catalogue_items_tenant_code on public.catalogue_items (tenant_id, code);'
    )
    expect(executable).toContain(
      'create index if not exists idx_catalogue_items_tenant_trade on public.catalogue_items (tenant_id, trade);'
    )
    expect(executable).toContain(
      'on public.catalogue_items using gin (name extensions.gin_trgm_ops);'
    )
    expect(executable).toContain(
      'on public.catalogue_prices (tenant_id, item_id, region, checked_on desc, created_at desc);'
    )
  })

  it('scopes every reference to the tenant', () => {
    expect(executable).toContain(
      'foreign key (tenant_id, item_id) references public.catalogue_items (tenant_id, id)'
    )
    expect(executable).toContain(
      'foreign key (tenant_id, vendor_id) references public.vendors (tenant_id, id)'
    )
    expect(executable.match(/references public\.users \(tenant_id, id\)/g)).toHaveLength(3)
    expect(executable.match(/references public\.tenants\(id\) on delete cascade/g)).toHaveLength(2)
  })

  it('forces RLS with a tenant SELECT policy and gives browser roles no privilege', () => {
    expect(executable).toContain("'alter table public.%i enable row level security'")
    expect(executable).toContain("'alter table public.%i force row level security'")
    expect(executable).toContain(
      'for select to authenticated using (tenant_id = public.auth_tenant_id())'
    )
    expect(executable).toContain(
      'revoke all privileges on table public.catalogue_items, public.catalogue_prices from public, anon, authenticated;'
    )
    expect(executable).not.toMatch(/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/)
    expect(executable).not.toMatch(/for (insert|update|delete|all) to/)
  })

  it('makes prices append-only, audited and never future-dated', () => {
    expect(executable).toContain(
      'create trigger catalogue_prices_append_only before update or delete on public.catalogue_prices'
    )
    expect(executable).toContain(
      'revoke execute on function public.prevent_catalogue_price_mutation() from public, anon, authenticated;'
    )
    expect(executable).toContain("checked_on <= (now() at time zone 'asia/manila')::date")
    expect(executable).toContain('execute function public.audit_log_trigger()')
  })
})

const runtimeDescribe = DATABASE_URL ? describe : describe.skip

type Tx = postgres.TransactionSql

/** How the database refused a statement; both fields are undefined when it ran. */
async function failure(tx: Tx, statement: string, parameters: string[] = []) {
  await tx.unsafe('savepoint catalogue_probe')
  let code: string | undefined
  let constraint: string | undefined
  try {
    await tx.unsafe(statement, parameters)
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      if ('code' in error && typeof error.code === 'string') code = error.code
      if ('constraint_name' in error && typeof error.constraint_name === 'string') {
        constraint = error.constraint_name
      }
    }
  }
  await tx.unsafe('rollback to savepoint catalogue_probe')
  await tx.unsafe('release savepoint catalogue_probe')
  return { code, constraint }
}

async function failureCode(tx: Tx, statement: string, parameters: string[] = []) {
  return (await failure(tx, statement, parameters)).code
}

async function insertItem(tx: Tx, tenantId: string, code = 'CN-0001'): Promise<string> {
  const [item] = await tx.unsafe<Array<{ id: string }>>(
    `insert into public.catalogue_items (tenant_id, code, name, trade, unit)
     values ($1::uuid, $2, 'Cement 40 kg', 'concrete', 'bag') returning id`,
    [tenantId, code]
  )
  return item!.id
}

async function insertPrice(tx: Tx, tenantId: string, itemId: string): Promise<string> {
  const [price] = await tx.unsafe<Array<{ id: string }>>(
    `insert into public.catalogue_prices
       (tenant_id, item_id, price_low_centavos, price_avg_centavos, price_high_centavos,
        source_kind, checked_on)
     values ($1::uuid, $2::uuid, 24000, 26500, 28000, 'research', date '2026-11-05')
     returning id`,
    [tenantId, itemId]
  )
  return price!.id
}

const ITEM_COLUMNS = '(tenant_id, code, name, trade, unit, specification)'
const PRICE_COLUMNS =
  '(tenant_id, item_id, price_low_centavos, price_avg_centavos, price_high_centavos, source_kind, checked_on, region, source_url, price_basis, source_name, flag, notes)'
const MANILA_TODAY = "(now() at time zone 'Asia/Manila')::date"

interface SeedCounts {
  itemsInserted: number
  itemsUpdated: number
  itemsKeptEdited: number
  itemsUnchanged: number
  pricesInserted: number
  pricesAlreadyPresent: number
}
type SeedCatalogue = (
  sql: Tx,
  input: { tenantId: string; rows: Array<Record<string, unknown>> }
) => Promise<SeedCounts>

const seedRow = (code: string, name: string, price: object | null) => ({
  code,
  name,
  trade: 'concrete',
  specification: null,
  unit: 'bag',
  price,
  region: 'NCR',
  price_basis: 'material_supply',
  source_url: price ? 'https://example.com/prices' : null,
  checked_on: '2026-11-05',
  flag: price ? 'SINGLE_SOURCE' : 'NO_SOURCE',
  notes: null,
})

runtimeDescribe('catalogue price book (database)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('enforces the item rules', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, tenantB } = await seedTwoTenants(tx)
      // `values` is the list after the tenant, without the closing parenthesis.
      const item = (values: string) =>
        failure(tx, `insert into public.catalogue_items ${ITEM_COLUMNS} values ($1::uuid, ${values})`, [tenantA])

      // Rows at the limits are accepted: the refusals below are not syntax errors.
      for (const valid of [
        `'CN-0001', 'Cement', 'concrete', 'bag', null`,
        `'SUP-12', 'Supplier item', 'paint', 'pc/month', repeat('x', 2000)`,
        `'SUP-123456789012', repeat('x', 300), 'equipment', repeat('x', 20), null`,
      ]) {
        expect(await item(valid), valid).toEqual({ code: undefined, constraint: undefined })
      }
      // Each bad row is refused by the one check written for it.
      for (const [invalid, constraint] of [
        [`'cn-0001', 'Cement', 'concrete', 'bag', null`, 'catalogue_items_code_format'],
        [`'CN-001', 'Cement', 'concrete', 'bag', null`, 'catalogue_items_code_format'],
        [`'SUP-', 'Cement', 'concrete', 'bag', null`, 'catalogue_items_code_format'],
        [`'CN-0001', ' Cement ', 'concrete', 'bag', null`, 'catalogue_items_name_check'],
        [`'CN-0001', '', 'concrete', 'bag', null`, 'catalogue_items_name_check'],
        [`'CN-0001', repeat('x', 301), 'concrete', 'bag', null`, 'catalogue_items_name_check'],
        [`'CN-0001', 'Cement', 'carpentry', 'bag', null`, 'catalogue_items_trade_check'],
        [`'CN-0001', 'Cement', 'concrete', '', null`, 'catalogue_items_unit_length'],
        [`'CN-0001', 'Cement', 'concrete', repeat('x', 21), null`, 'catalogue_items_unit_length'],
        [
          `'CN-0001', 'Cement', 'concrete', 'bag', repeat('x', 2001)`,
          'catalogue_items_specification_length',
        ],
      ] as const) {
        expect(await item(invalid), invalid).toEqual({ code: '23514', constraint })
      }

      await insertItem(tx, tenantA, 'CN-0002')
      expect(await item(`'CN-0002', 'Again', 'concrete', 'bag', null`)).toEqual({
        code: '23505',
        constraint: 'ux_catalogue_items_tenant_code',
      })
      // The same code is free in another tenant.
      await insertItem(tx, tenantB, 'CN-0002')
    })
  })

  it('enforces the price rules, including no future checked date', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      const itemId = await insertItem(tx, tenantA)
      const price = (values: string) =>
        failure(
          tx,
          `insert into public.catalogue_prices ${PRICE_COLUMNS} values ($1::uuid, $2::uuid, ${values})`,
          [tenantA, itemId]
        )
      const ok = (overrides: Partial<Record<string, string>> = {}) => {
        const row = {
          low: '100', avg: '150', high: '200', kind: `'manual'`, checked: MANILA_TODAY,
          region: `'NCR'`, url: `'https://example.com/a'`, basis: 'null', source: 'null',
          flag: 'null', notes: 'null', ...overrides,
        }
        return `${row.low}, ${row.avg}, ${row.high}, ${row.kind}, ${row.checked}, ${row.region}, ${row.url}, ${row.basis}, ${row.source}, ${row.flag}, ${row.notes}`
      }

      // Rows at the limits are accepted: the refusals below are not syntax errors.
      for (const valid of [
        {},
        { low: 'null', avg: 'null', high: 'null', url: 'null' },
        { low: '0', avg: '0', high: '0', url: `'http://example.com'` },
        {
          region: `repeat('x', 40)`, basis: `repeat('x', 60)`, source: `repeat('x', 200)`,
          flag: `repeat('x', 200)`, notes: `repeat('x', 2000)`,
        },
      ]) {
        expect(await price(ok(valid)), JSON.stringify(valid)).toEqual({
          code: undefined,
          constraint: undefined,
        })
      }
      // Each bad row is refused by the one check written for it.
      for (const [invalid, constraint] of [
        [{ avg: 'null' }, 'catalogue_prices_price_range'],
        [{ low: 'null' }, 'catalogue_prices_price_range'],
        [{ low: '151' }, 'catalogue_prices_price_range'],
        [{ avg: '201' }, 'catalogue_prices_price_range'],
        [{ low: '-1' }, 'catalogue_prices_price_range'],
        [{ kind: `'guess'` }, 'catalogue_prices_source_kind_check'],
        [{ region: `''` }, 'catalogue_prices_region_length'],
        [{ region: `repeat('x', 41)` }, 'catalogue_prices_region_length'],
        [{ url: `'ftp://example.com/a'` }, 'catalogue_prices_source_url_check'],
        [{ url: `'javascript:alert(1)'` }, 'catalogue_prices_source_url_check'],
        [{ url: `'https://example.com/' || repeat('a', 2000)` }, 'catalogue_prices_source_url_check'],
        [{ basis: `repeat('x', 61)` }, 'catalogue_prices_basis_length'],
        [{ source: `repeat('x', 201)` }, 'catalogue_prices_source_name_length'],
        [{ flag: `repeat('x', 201)` }, 'catalogue_prices_flag_length'],
        [{ notes: `repeat('x', 2001)` }, 'catalogue_prices_notes_length'],
        [{ checked: `${MANILA_TODAY} + 1` }, 'catalogue_prices_checked_on_not_future'],
      ] as const) {
        expect(await price(ok(invalid)), JSON.stringify(invalid)).toEqual({
          code: '23514',
          constraint,
        })
      }
    })
  })

  it('blocks links across tenants through the tenant-scoped foreign keys', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const itemA = await insertItem(tx, tenantA)
      const [vendorB] = await tx.unsafe<Array<{ id: string }>>(
        `insert into public.vendors (tenant_id, name) values ($1::uuid, 'Probe vendor') returning id`,
        [tenantB]
      )
      const price = (tenant: string, extraColumns = '', extraValues = '', parameters: string[] = []) =>
        failureCode(
          tx,
          `insert into public.catalogue_prices (tenant_id, item_id, source_kind, checked_on${extraColumns})
           values ($1::uuid, $2::uuid, 'manual', date '2026-11-05'${extraValues})`,
          [tenant, itemA, ...parameters]
        )

      // Tenant B cannot attach a price to tenant A's item.
      expect(await price(tenantB)).toBe('23503')
      expect(await price(tenantA, ', vendor_id', ', $3::uuid', [vendorB!.id])).toBe('23503')
      expect(await price(tenantA, ', created_by', ', $3::uuid', [userB])).toBe('23503')
      expect(await price(tenantA, ', created_by', ', $3::uuid', [userA])).toBeUndefined()
      expect(
        await failureCode(
          tx,
          `update public.catalogue_items set updated_by = $2::uuid where id = $1::uuid`,
          [itemA, userB]
        )
      ).toBe('23503')
    })
  })

  it.each(['authenticated', 'anon'] as const)(
    'gives %s no read and no write on either table',
    async (role) => {
      await inRollback(sql, async (tx) => {
        const tenants = await seedTwoTenants(tx)
        const itemId = await insertItem(tx, tenants.tenantA)
        await insertPrice(tx, tenants.tenantA, itemId)

        if (role === 'authenticated') await becomeAuthenticated(tx, tenants.userA)
        else {
          await tx.unsafe(`select set_config('request.jwt.claims', '', true)`)
          await tx.unsafe('set local role anon')
        }
        for (const statement of [
          'select id from public.catalogue_items',
          'select id from public.catalogue_prices',
          `insert into public.catalogue_items (tenant_id, code, name, trade, unit) values ('${tenants.tenantA}', 'CN-0009', 'x', 'concrete', 'bag')`,
          `update public.catalogue_items set name = 'changed'`,
          'delete from public.catalogue_items',
          `insert into public.catalogue_prices (tenant_id, item_id, source_kind, checked_on) values ('${tenants.tenantA}', '${itemId}', 'manual', date '2026-11-05')`,
          `update public.catalogue_prices set notes = 'changed'`,
          'delete from public.catalogue_prices',
          'truncate table public.catalogue_prices',
        ]) {
          expect(await failureCode(tx, statement), statement).toBe('42501')
        }
        await tx.unsafe('reset role')
      })
    }
  )

  it('keeps tenants apart through RLS even if a SELECT grant is restored', async () => {
    await inRollback(sql, async (tx) => {
      const tenants: TwoTenants = await seedTwoTenants(tx)
      const itemId = await insertItem(tx, tenants.tenantA)
      await insertPrice(tx, tenants.tenantA, itemId)
      // Rolled back with the rest: simulates an accidental regrant.
      await tx.unsafe(
        'grant select on public.catalogue_items, public.catalogue_prices to authenticated'
      )
      const visible = async (userId: string) => {
        await becomeAuthenticated(tx, userId)
        const [row] = await tx.unsafe<Array<{ items: number; prices: number }>>(
          `select (select count(*)::int from public.catalogue_items) as items,
                  (select count(*)::int from public.catalogue_prices) as prices`
        )
        await tx.unsafe('reset role')
        return row
      }

      expect(await visible(tenants.userB)).toEqual({ items: 0, prices: 0 })
      expect(await visible(tenants.userA)).toEqual({ items: 1, prices: 1 })
    })
  })

  it('rejects UPDATE and DELETE of a price observation, and audits inserts', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      const itemId = await insertItem(tx, tenantA)
      const priceId = await insertPrice(tx, tenantA, itemId)

      expect(
        await failureCode(tx, `update public.catalogue_prices set price_avg_centavos = 1 where id = $1::uuid`, [priceId])
      ).toBe('55000')
      expect(
        await failureCode(tx, `delete from public.catalogue_prices where id = $1::uuid`, [priceId])
      ).toBe('55000')
      // The item cannot be removed from under its history either.
      expect(
        await failureCode(tx, `delete from public.catalogue_items where id = $1::uuid`, [itemId])
      ).toBe('23503')

      // A correction is a new row; the first one is untouched.
      await insertPrice(tx, tenantA, itemId)
      const prices = await tx.unsafe<Array<{ price_avg_centavos: string }>>(
        `select price_avg_centavos from public.catalogue_prices where item_id = $1::uuid`,
        [itemId]
      )
      expect(prices.map((row) => Number(row.price_avg_centavos))).toEqual([26500, 26500])

      const audited = await tx.unsafe<Array<{ entity_type: string; rows: number }>>(
        `select entity_type, count(*)::int as rows
           from public.audit_log
          where tenant_id = $1::uuid and entity_type like 'catalogue_%'
          group by entity_type order by entity_type`,
        [tenantA]
      )
      expect(audited).toEqual([
        { entity_type: 'catalogue_items', rows: 1 },
        { entity_type: 'catalogue_prices', rows: 2 },
      ])
    })
  })

  it('seeds idempotently, never overwrites an item a person edited, and audits each run', async () => {
    // The seed's database half is plain JavaScript shared with the script.
    const seedModule = new URL('../../../../scripts/lib/catalogue-seed.mjs', import.meta.url).href
    const { seedCatalogue } = (await import(/* @vite-ignore */ seedModule)) as {
      seedCatalogue: SeedCatalogue
    }
    const price = { low: 24000, avg: 26500, high: 28000 }
    const rows = [
      seedRow('CN-0001', 'Cement 40 kg', price),
      seedRow('CN-0002', 'Cement 50 kg', price),
      seedRow('CN-0003', 'Holcim Excel 40 kg', null),
    ]

    await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA } = await seedTwoTenants(tx)
      const totals = async () => {
        const [row] = await tx.unsafe<Array<{ items: number; prices: number }>>(
          `select (select count(*)::int from public.catalogue_items where tenant_id = $1::uuid) as items,
                  (select count(*)::int from public.catalogue_prices where tenant_id = $1::uuid) as prices`,
          [tenantA]
        )
        return row
      }

      // Every row leaves one observation, the unpriced CN-0003 included.
      expect(await seedCatalogue(tx, { tenantId: tenantA, rows })).toMatchObject({
        itemsInserted: 3, itemsUpdated: 0, itemsKeptEdited: 0, itemsUnchanged: 0,
        pricesInserted: 3, pricesAlreadyPresent: 0,
      })
      expect(await totals()).toEqual({ items: 3, prices: 3 })

      // Second run: nothing new, not even for the observation with null prices.
      expect(await seedCatalogue(tx, { tenantId: tenantA, rows })).toMatchObject({
        itemsInserted: 0, itemsUpdated: 0, itemsKeptEdited: 0, itemsUnchanged: 3,
        pricesInserted: 0, pricesAlreadyPresent: 3,
      })
      expect(await totals()).toEqual({ items: 3, prices: 3 })
      const [unpriced] = await tx.unsafe<Array<{ observations: number }>>(
        `select count(*)::int as observations
           from public.catalogue_prices price
           join public.catalogue_items item on item.id = price.item_id
          where price.tenant_id = $1::uuid
            and item.code = 'CN-0003'
            and price.price_low_centavos is null
            and price.price_avg_centavos is null
            and price.price_high_centavos is null
            and price.flag = 'NO_SOURCE'`,
        [tenantA]
      )
      expect(unpriced).toEqual({ observations: 1 })

      // A person edits CN-0001; the research text of both priced items changes.
      await tx.unsafe(
        `update public.catalogue_items set name = 'Edited by admin', updated_by = $2::uuid
          where tenant_id = $1::uuid and code = 'CN-0001'`,
        [tenantA, userA]
      )
      const revised = [
        seedRow('CN-0001', 'Cement 40 kg (revised)', price),
        seedRow('CN-0002', 'Cement 50 kg (revised)', price),
        rows[2]!,
      ]
      expect(await seedCatalogue(tx, { tenantId: tenantA, rows: revised })).toMatchObject({
        itemsInserted: 0, itemsUpdated: 1, itemsKeptEdited: 1, itemsUnchanged: 1,
        pricesInserted: 0, pricesAlreadyPresent: 3,
      })
      const names = await tx.unsafe<Array<{ code: string; name: string }>>(
        `select code, name from public.catalogue_items where tenant_id = $1::uuid order by code`,
        [tenantA]
      )
      expect(names.map((row) => row.name)).toEqual([
        'Edited by admin',
        'Cement 50 kg (revised)',
        'Holcim Excel 40 kg',
      ])

      // One catalogue_seed audit entry per run, hashed like audit_log_trigger()
      // and linked into the tenant's chain. Nothing reached the other tenant.
      const [audit] = await tx.unsafe<
        Array<{ runs: number; hashes_ok: boolean; broken_links: number; last_kept: number }>
      >(
        `with chain as (
           select id, entity_type, entity_key, action, diff, prev_hash, hash, created_at,
                  lag(hash) over (order by id) as previous_hash
             from public.audit_log
            where tenant_id = $1::uuid
         )
         select count(*) filter (where entity_type = 'catalogue_seed')::int as runs,
                coalesce(bool_and(
                  hash = encode(sha256(convert_to(
                    prev_hash || entity_type || entity_key || action || created_at::text, 'UTF8'
                  )), 'hex')
                ) filter (where entity_type = 'catalogue_seed'), false) as hashes_ok,
                count(*) filter (
                  where prev_hash is distinct from coalesce(previous_hash, 'genesis')
                )::int as broken_links,
                (array_agg((diff ->> 'itemsKeptEdited')::int order by id desc)
                  filter (where entity_type = 'catalogue_seed'))[1] as last_kept
           from chain`,
        [tenantA]
      )
      expect(audit).toEqual({ runs: 3, hashes_ok: true, broken_links: 0, last_kept: 1 })
      const [other] = await tx.unsafe<Array<{ rows: number }>>(
        `select count(*)::int as rows from public.catalogue_items where tenant_id = $1::uuid`,
        [tenantB]
      )
      expect(other).toEqual({ rows: 0 })
    })
  })
})
