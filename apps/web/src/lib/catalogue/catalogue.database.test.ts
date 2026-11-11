/**
 * The catalogue reads, and the edit and record-price actions, against a real database
 * holding the real research files (docs/erp/specs/catalogue.md, section 8).
 *
 * Needs DATABASE_URL (a local, disposable database) and skips itself without
 * it. Each test seeds a probe tenant with data/catalogue/*.csv through the
 * seed's own database half, inside a transaction that is always rolled back:
 * catalogue prices are append-only, so committed probe rows could never be
 * removed. The app's `db` is pointed at that transaction for the test.
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tx: null as unknown, profile: null as unknown }))

vi.mock('@third-code-erp/database', async (original) => ({
  ...(await original<typeof import('@third-code-erp/database')>()),
  db: new Proxy({}, { get: (_target, property) => Reflect.get(state.tx as object, property) }),
}))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: async () => state.profile,
  AuthError: class AuthError extends Error {},
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { cataloguePrices } from '@third-code-erp/database/schema'
import { editCatalogueItem, recordCataloguePrice } from '@/app/(dashboard)/catalogue/actions'
import type { CatalogueCsvRow } from './csv'
import { CATALOGUE_PAGE_SIZE, getCatalogueItemDetail, listCatalogueItems } from './queries'
import { readResearchFiles } from './research-files'
import { manilaToday, splitCatalogueFlags } from './rules'

const DATABASE_URL = process.env.DATABASE_URL?.trim()
if (DATABASE_URL && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(DATABASE_URL).hostname)) {
  throw new Error('The catalogue database tests only run against a loopback database')
}
const suite = DATABASE_URL ? describe : describe.skip

type RealDatabase = (typeof import('@third-code-erp/database'))['db']
type Tx = Parameters<Parameters<RealDatabase['transaction']>[0]>[0]
interface SeedCounts {
  itemsKeptEdited: number
  pricesInserted: number
  pricesAlreadyPresent: number
}
type SeedCatalogue = (
  handle: { unsafe: (query: string, parameters?: unknown[]) => Promise<unknown> },
  input: { tenantId: string; rows: CatalogueCsvRow[] },
) => Promise<SeedCounts>

const rows = readResearchFiles()
const priced = rows.filter((row) => row.price)
const unpriced = rows.filter((row) => !row.price)

/** The seed speaks postgres.js (`unsafe(text, parameters)`); this runs its statements on the test's transaction. */
function seedHandle(tx: Tx) {
  return {
    unsafe: (query: string, parameters: unknown[] = []) =>
      tx.execute(
        sql.join(
          query
            .split(/\$(\d+)/)
            .map((part, index) =>
              index % 2 ? sql`${parameters[Number(part) - 1]}` : sql.raw(part),
            ),
        ),
      ),
  }
}

interface Seeded {
  tx: Tx
  actor: { tenantId: string; role: 'estimator' }
  userId: string
  seed: () => Promise<SeedCounts>
}

const ROLLBACK = Symbol('rollback')
let realDb: RealDatabase | undefined

/** Seeds a probe tenant with the research files, runs `probe`, and rolls everything back. */
async function seeded(probe: (context: Seeded) => Promise<void>): Promise<void> {
  realDb ??= (
    await vi.importActual<typeof import('@third-code-erp/database')>('@third-code-erp/database')
  ).db
  const seedModule = new URL('../../../../../scripts/lib/catalogue-seed.mjs', import.meta.url).href
  const { seedCatalogue } = (await import(/* @vite-ignore */ seedModule)) as {
    seedCatalogue: SeedCatalogue
  }

  try {
    await realDb.transaction(async (tx) => {
      state.tx = tx
      const tenantId = randomUUID()
      const userId = randomUUID()
      await tx.execute(
        sql`insert into tenants (id, name, slug) values (${tenantId}, 'Catalogue probe', ${`catalogue-probe-${tenantId}`})`,
      )
      await tx.execute(
        sql`insert into users (id, tenant_id, email, full_name, role)
            values (${userId}, ${tenantId}, ${`${userId}@probe.invalid`}, 'Catalogue Probe', 'admin')`,
      )
      const seed = () => seedCatalogue(seedHandle(tx), { tenantId, rows })
      await seed()
      await probe({ tx, actor: { tenantId, role: 'estimator' }, userId, seed })
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return form
}

async function listed(actor: Seeded['actor'], filters: Record<string, string>) {
  const result = await listCatalogueItems(actor, filters)
  if (!result.ok) throw new Error(`list failed: ${result.error}`)
  return result.data
}

async function detailOf(actor: Seeded['actor'], code: string) {
  const { rows: found } = await listed(actor, { q: code })
  const result = await getCatalogueItemDetail(actor, found[0]?.id ?? '')
  if (!result.ok) throw new Error(`detail of ${code} failed: ${result.error}`)
  return result.data
}

// Every test loads the whole catalogue first, so each gets a minute, not 5 seconds.
suite('catalogue reads against the seeded research files (database)', { timeout: 60_000 }, () => {
  beforeAll(() => {
    vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await realDb?.$client.end({ timeout: 5 })
  })

  it('holds one item and one observation for every row of the files', async () => {
    expect(rows.length).toBeGreaterThan(CATALOGUE_PAGE_SIZE)
    expect(priced.length).toBeGreaterThan(0)
    expect(unpriced.length).toBeGreaterThan(0)

    await seeded(async ({ tx, actor, seed }) => {
      const [stored] = await tx.execute<{ items: number; priced: number; unpriced: number }>(sql`
        select (select count(*)::int from catalogue_items where tenant_id = ${actor.tenantId}) as items,
               count(*) filter (where price_avg_centavos is not null)::int as priced,
               count(*) filter (where price_avg_centavos is null)::int as unpriced
          from catalogue_prices
         where tenant_id = ${actor.tenantId}`)
      expect(stored).toEqual({
        items: rows.length,
        priced: priced.length,
        unpriced: unpriced.length,
      })

      // A second run finds every observation, the null-price ones included.
      expect(await seed()).toMatchObject({ pricesInserted: 0, pricesAlreadyPresent: rows.length })
    })
  })

  it('pages 50 at a time, in code order, with the total of the whole catalogue', async () => {
    await seeded(async ({ actor }) => {
      const codes = rows.map((row) => row.code).sort()
      const pages = Math.ceil(rows.length / CATALOGUE_PAGE_SIZE)

      const first = await listed(actor, {})
      expect(first).toMatchObject({ total: rows.length, page: 1, limit: 50, totalPages: pages })
      expect(first.rows.map((row) => row.code)).toEqual(codes.slice(0, 50))

      const second = await listed(actor, { page: '2' })
      expect(second.rows.map((row) => row.code)).toEqual(codes.slice(50, 100))

      const last = await listed(actor, { page: String(pages) })
      expect(last.total).toBe(rows.length)
      expect(last.rows.map((row) => row.code)).toEqual(codes.slice((pages - 1) * 50))
    })
  })

  it('finds an item by its code or a word of its name, and nothing in another tenant', async () => {
    await seeded(async ({ tx, actor }) => {
      const wanted = priced[0]!

      for (const q of [wanted.code, wanted.code.toLowerCase()]) {
        const byCode = await listed(actor, { q })
        expect(byCode.total).toBe(1)
        expect(byCode.rows[0]).toMatchObject({ code: wanted.code, name: wanted.name })
      }

      const word = wanted.name.split(/\s+/).find((part) => /^[a-z]{4,}$/i.test(part)) ?? wanted.name
      const byName = await listed(actor, { q: word })
      const matching = rows.filter((row) =>
        `${row.code}\n${row.name}`.toLowerCase().includes(word.toLowerCase()),
      )
      expect(byName.total).toBe(matching.length)
      expect(matching.map((row) => row.code)).toContain(wanted.code)
      for (const row of byName.rows) {
        expect(`${row.code}\n${row.name}`.toLowerCase()).toContain(word.toLowerCase())
      }

      // `%` and `_` are text, not wildcards.
      expect((await listed(actor, { q: '%' })).total).toBe(
        rows.filter((row) => `${row.code}${row.name}`.includes('%')).length,
      )

      const otherTenant = randomUUID()
      await tx.execute(
        sql`insert into tenants (id, name, slug) values (${otherTenant}, 'Other probe', ${`catalogue-other-${otherTenant}`})`,
      )
      const stranger = { tenantId: otherTenant, role: 'estimator' } as const
      expect((await listed(stranger, { q: wanted.code })).total).toBe(0)
      const { item } = await detailOf(actor, wanted.code)
      expect(await getCatalogueItemDetail(stranger, item.id)).toMatchObject({ ok: false, status: 404 })
    })
  })

  it('filters by trade and by price status on the current observation', async () => {
    await seeded(async ({ actor }) => {
      const hasFlag = (row: CatalogueCsvRow, token: RegExp) =>
        splitCatalogueFlags(row.flag).some((flag) => token.test(flag))

      const paint = await listed(actor, { trade: 'paint' })
      expect(paint.total).toBe(rows.filter((row) => row.trade === 'paint').length)
      expect(paint.rows.length).toBeGreaterThan(0)
      for (const row of paint.rows) expect(row.trade).toBe('paint')

      const noSource = await listed(actor, { status: 'no_source' })
      expect(noSource.total).toBe(unpriced.length)
      expect(noSource.rows).toHaveLength(Math.min(50, unpriced.length))
      for (const row of noSource.rows) {
        // An observation, with its flag, but no price.
        expect(row.price).toMatchObject({ price_avg_centavos: null, flags: ['NO_SOURCE'] })
      }

      const withPrice = await listed(actor, { status: 'priced' })
      expect(withPrice.total).toBe(priced.length)
      for (const row of withPrice.rows) expect(row.price?.price_avg_centavos).toEqual(expect.any(Number))

      expect((await listed(actor, { status: 'stale' })).total).toBe(
        rows.filter((row) => hasFlag(row, /^STALE_\d{4}$/)).length,
      )
      expect((await listed(actor, { status: 'low_authority' })).total).toBe(
        rows.filter((row) => hasFlag(row, /^LOW_AUTHORITY$/)).length,
      )
      expect((await listed(actor, { trade: 'paint', status: 'no_source' })).total).toBe(
        unpriced.filter((row) => row.trade === 'paint').length,
      )
    })
  })

  it('filters by region in any letter case, and counts an item never observed there as no source', async () => {
    await seeded(async ({ actor }) => {
      const inNcr = rows.filter((row) => row.region.toLowerCase() === 'ncr')
      const elsewhere = rows.length - inNcr.length
      expect(inNcr.length).toBeGreaterThan(0)
      expect(elsewhere).toBeGreaterThan(0)

      for (const region of ['NCR', 'ncr', ' nCr ']) {
        const found = await listed(actor, { region })
        expect(found.total, region).toBe(inNcr.length)
        for (const row of found.rows) expect(row.price?.region.toLowerCase(), row.code).toBe('ncr')
      }
      expect((await listed(actor, { region: 'ncr', status: 'priced' })).total).toBe(
        inNcr.filter((row) => row.price).length,
      )
      // No source in NCR: no price found there, or never observed there at all.
      const noSource = await listed(actor, { region: 'ncr', status: 'no_source' })
      expect(noSource.total).toBe(inNcr.filter((row) => !row.price).length + elsewhere)
      expect((await listed(actor, { region: 'Atlantis' })).total).toBe(0)
    })
  })

  it('treats "NCR" and "ncr" as one region in the list, the item page and a recorded price', async () => {
    await seeded(async ({ actor, userId }) => {
      const wanted = priced.find((row) => row.region === 'NCR')
      expect(wanted).toBeDefined()
      const { item } = await detailOf(actor, wanted!.code)
      state.profile = { user: { id: userId }, tenantId: actor.tenantId, role: 'admin' }
      const recordInLowerCase = (checked_on: string) =>
        recordCataloguePrice(
          formOf({
            item_id: item.id,
            price_php: '100',
            region: 'ncr',
            source_name: 'Supplier quotation',
            checked_on,
          }),
        )

      // Older than the research price recorded as "NCR": the same region, so not current.
      expect(await recordInLowerCase('2020-01-02')).toMatchObject({
        ok: true,
        data: { region: 'ncr', current: false },
      })
      // Dated today: the newest priced entry of the region, so current.
      const newest = await recordInLowerCase(manilaToday())
      expect(newest).toMatchObject({ ok: true, data: { current: true } })
      const newestId = newest.ok ? newest.data.id : ''

      // One row for the item, not one per spelling of the region.
      for (const filters of [{ q: wanted!.code, region: 'ncr' }, { q: wanted!.code }]) {
        const found = await listed(actor, filters)
        expect(found.total, JSON.stringify(filters)).toBe(1)
        expect(found.rows, JSON.stringify(filters)).toHaveLength(1)
        expect(found.rows[0]?.price).toMatchObject({ id: newestId, region: 'ncr' })
      }

      // The item page marks one entry Current for "NCR" and "ncr" together.
      const detail = await detailOf(actor, wanted!.code)
      expect(detail.history.map((price) => price.region).sort()).toEqual(['NCR', 'ncr', 'ncr'])
      expect(detail.current.map((price) => price.id)).toEqual([newestId])
    })
  })

  it('returns a priced item in centavos and an unpriced item with its note and no price', async () => {
    await seeded(async ({ actor }) => {
      const wanted = priced.find((row) => row.price!.low !== row.price!.high) ?? priced[0]!
      const { rows: found } = await listed(actor, { q: wanted.code })
      expect(found[0]?.price).toMatchObject({
        region: wanted.region,
        price_low_centavos: wanted.price!.low,
        price_avg_centavos: wanted.price!.avg,
        price_high_centavos: wanted.price!.high,
        price_basis: wanted.price_basis,
        source_kind: 'research',
        source_url: wanted.source_url,
        checked_on: wanted.checked_on,
        flags: splitCatalogueFlags(wanted.flag),
      })

      const pricedDetail = await detailOf(actor, wanted.code)
      expect(pricedDetail.item).toMatchObject({
        code: wanted.code,
        name: wanted.name,
        trade: wanted.trade,
        unit: wanted.unit,
        specification: wanted.specification,
        is_active: true,
      })
      expect(pricedDetail.history).toHaveLength(1)
      expect(pricedDetail.historyCapped).toBe(false)
      // Whole centavos as numbers, not the strings a bigint column can come back as.
      expect(pricedDetail.history[0]?.price_avg_centavos).toBe(wanted.price!.avg)
      expect(pricedDetail.current.map((price) => price.id)).toEqual([pricedDetail.history[0]?.id])

      const missing = unpriced.find((row) => row.notes) ?? unpriced[0]!
      const { rows: listedMissing } = await listed(actor, { q: missing.code })
      expect(listedMissing[0]?.price).toMatchObject({
        region: missing.region,
        price_low_centavos: null,
        price_avg_centavos: null,
        price_high_centavos: null,
        checked_on: missing.checked_on,
        flags: ['NO_SOURCE'],
        notes: missing.notes,
      })
      expect(missing.notes).toEqual(expect.any(String))

      const missingDetail = await detailOf(actor, missing.code)
      expect(missingDetail.history).toHaveLength(1)
      expect(missingDetail.history[0]).toMatchObject({
        price_avg_centavos: null,
        flag: 'NO_SOURCE',
        notes: missing.notes,
        source_url: missing.source_url,
      })
    })
  })

  it('keeps a recorded price current when a later observation finds no price', async () => {
    await seeded(async ({ tx, actor, userId, seed }) => {
      // An item the research found no price for: its "no source" observation is current.
      const item = unpriced[0]!
      const before = await detailOf(actor, item.code)
      expect(before.current[0]?.price_avg_centavos).toBeNull()

      // A person records a price that was checked before the research ran.
      state.profile = { user: { id: userId }, tenantId: actor.tenantId, role: 'admin' }
      const recorded = await recordCataloguePrice(
        formOf({
          item_id: before.item.id,
          price_php: '1,234.50',
          region: item.region,
          source_name: 'Supplier quotation',
          checked_on: '2026-01-15',
        }),
      )
      // Only "no price" rows are dated later, so this price becomes current.
      expect(recorded).toMatchObject({ ok: true, data: { current: true } })

      // Then newer "no price found" rows arrive: a re-run of the seed, and a
      // fresh research pass dated today.
      expect(await seed()).toMatchObject({ pricesInserted: 0 })
      await tx.insert(cataloguePrices).values({
        tenant_id: actor.tenantId,
        item_id: before.item.id,
        region: item.region,
        source_kind: 'research',
        checked_on: manilaToday(),
        flag: 'NO_SOURCE',
        notes: 'Checked again: still nothing public.',
        created_at: sql`clock_timestamp()`,
      })

      // The price is still the current one, everywhere "current" is read.
      const { rows: found, total } = await listed(actor, { q: item.code })
      expect(total).toBe(1)
      expect(found[0]?.price).toMatchObject({
        id: recorded.ok ? recorded.data.id : '',
        region: item.region,
        price_low_centavos: 123_450,
        price_avg_centavos: 123_450,
        price_high_centavos: 123_450,
        source_kind: 'manual',
        source_name: 'Supplier quotation',
        checked_on: '2026-01-15',
        flags: [],
      })
      expect((await listed(actor, { q: item.code, status: 'priced' })).total).toBe(1)
      expect((await listed(actor, { q: item.code, status: 'no_source' })).total).toBe(0)
      expect((await listed(actor, { status: 'no_source' })).total).toBe(unpriced.length - 1)

      // The history stays in date order; only "current" prefers the price.
      const after = await detailOf(actor, item.code)
      expect(after.history.map((price) => price.price_avg_centavos)).toEqual([null, null, 123_450])
      expect(after.history[0]?.checked_on).toBe(manilaToday())
      expect(after.current).toHaveLength(1)
      expect(after.current[0]).toMatchObject({ source_kind: 'manual', price_avg_centavos: 123_450 })
    })
  })

  it('audits an edit and a recorded price, writes nothing for an unchanged save, and the seed keeps the edit', async () => {
    await seeded(async ({ tx, actor, userId, seed }) => {
      const wanted = priced[0]!
      const { item } = await detailOf(actor, wanted.code)
      state.profile = { user: { id: userId }, tenantId: actor.tenantId, role: 'admin' }
      const itemRow = async () => {
        const [row] = await tx.execute<{ name: string; updated_by: string | null }>(
          sql`select name, updated_by::text as updated_by from catalogue_items where id = ${item.id}`,
        )
        return row
      }

      const fields = {
        id: item.id,
        name: `${wanted.name} (checked by hand)`,
        specification: wanted.specification ?? '',
        unit: wanted.unit,
        trade: wanted.trade,
        is_active: 'true',
      }
      expect(await editCatalogueItem(formOf(fields))).toEqual({
        ok: true,
        data: { id: item.id, changed: true },
      })
      // Saving the same values again changes nothing and writes nothing.
      expect(await editCatalogueItem(formOf(fields))).toEqual({
        ok: true,
        data: { id: item.id, changed: false },
      })
      expect(await itemRow()).toEqual({ name: fields.name, updated_by: userId })

      // Dated before the research observation: recorded, but not current.
      const older = await recordCataloguePrice(
        formOf({
          item_id: item.id,
          price_php: '100',
          region: wanted.region,
          source_name: 'Old quotation',
          checked_on: '2020-01-02',
        }),
      )
      expect(older).toMatchObject({ ok: true, data: { region: wanted.region, current: false } })

      const audited = await tx.execute<{
        entity_type: string
        entity_id: string
        action: string
        actor_id: string
        diff: string
      }>(sql`
        select entity_type, entity_id::text as entity_id, action, actor_id::text as actor_id,
               diff::text as diff
          from audit_log
         where tenant_id = ${actor.tenantId}
           and entity_type in ('catalogue_item', 'catalogue_price')
         order by id`)
      expect(audited.map(({ diff: _diff, ...entry }) => entry)).toEqual([
        { entity_type: 'catalogue_item', entity_id: item.id, action: 'update', actor_id: userId },
        {
          entity_type: 'catalogue_price',
          entity_id: older.ok ? older.data.id : '',
          action: 'create',
          actor_id: userId,
        },
      ])
      expect(JSON.parse(audited[0]!.diff)).toEqual({
        name: { before: wanted.name, after: fields.name },
      })
      expect(JSON.parse(audited[1]!.diff)).toMatchObject({
        price_avg_centavos: { after: 10_000 },
        source_kind: { after: 'manual' },
        checked_on: { after: '2020-01-02' },
      })

      // A re-run of the seed leaves the item as the person left it.
      expect(await seed()).toMatchObject({ itemsKeptEdited: 1, pricesInserted: 0 })
      expect(await itemRow()).toEqual({ name: fields.name, updated_by: userId })
    })
  })
})
