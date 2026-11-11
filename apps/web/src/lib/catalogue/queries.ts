import { db } from '@third-code-erp/database'
import {
  catalogueItems,
  cataloguePrices,
  type CatalogueItem,
  type CataloguePrice,
} from '@third-code-erp/database/schema'
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'
import { z } from 'zod'
import { catalogueAccessDenial, type CatalogueActor, type CatalogueResult } from './access'
import {
  CATALOGUE_LIMITS,
  CATALOGUE_PRICE_STATUSES,
  CATALOGUE_TRADE_SLUGS,
  cleanSingleLine,
  splitCatalogueFlags,
  type CataloguePriceStatus,
  type CatalogueTrade,
} from './rules'

/**
 * Catalogue reads for the web app. Drizzle connects as `postgres`, which
 * bypasses row-level security, so every query here carries an explicit
 * tenant_id predicate, and every function checks the flag and catalogue.read.
 */

export const CATALOGUE_PAGE_SIZE = 50
export const CATALOGUE_MAX_PAGE = 10_000
export const CATALOGUE_MAX_SEARCH_LENGTH = 100
export const CATALOGUE_HISTORY_LIMIT = 500

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

/** Search state of the catalogue page, as held in the URL. */
export const catalogueListFiltersSchema = z.object({
  q: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform((term) => cleanSingleLine(term).slice(0, CATALOGUE_MAX_SEARCH_LENGTH))
      .optional(),
  ),
  trade: z.preprocess(blankToUndefined, z.enum(CATALOGUE_TRADE_SLUGS).optional()),
  region: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform(cleanSingleLine)
      .pipe(z.string().min(1).max(CATALOGUE_LIMITS.region))
      .optional(),
  ),
  status: z.preprocess(blankToUndefined, z.enum(CATALOGUE_PRICE_STATUSES).optional()),
  page: z
    .preprocess(blankToUndefined, z.coerce.number().int().min(1).optional())
    .transform((page) => Math.min(page ?? 1, CATALOGUE_MAX_PAGE)),
})

export interface CatalogueListFilters {
  q?: string
  trade?: CatalogueTrade
  region?: string
  status?: CataloguePriceStatus
  page: number
}

export interface CatalogueCurrentPrice {
  id: string
  region: string
  price_low_centavos: number | null
  price_avg_centavos: number | null
  price_high_centavos: number | null
  price_basis: string | null
  source_kind: string
  source_name: string | null
  source_url: string | null
  checked_on: string
  flags: string[]
  /** For an observation without a price, why none was found. */
  notes: string | null
}

export interface CatalogueListRow {
  id: string
  code: string
  name: string
  trade: string
  specification: string | null
  unit: string
  is_active: boolean
  /**
   * The current observation in one region; null when the item has none there.
   * Its three prices are null when no price was found (`NO_SOURCE`): the flag
   * and the note still say why.
   */
  price: CatalogueCurrentPrice | null
}

export interface CatalogueListResult {
  rows: CatalogueListRow[]
  total: number
  page: number
  limit: number
  totalPages: number
  filters: CatalogueListFilters
}

/**
 * A price's region as one region is told from another: "NCR", "ncr" and " Ncr "
 * are the same region. Postgres lower-cases both sides, so the database's own
 * case rules apply everywhere a region is grouped or compared.
 */
export const regionKey = sql`lower(trim(${cataloguePrices.region}))`

/** True for a price in `region`, compared as `regionKey` compares it. */
export function inRegion(region: string): SQL {
  return sql`${regionKey} = lower(trim(${region}))`
}

/** `%`, `_` and `\` are literals in a search term, not ILIKE wildcards. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

function flagHasToken(flag: SQLWrapper, pattern: string): SQL {
  return sql`${flag} ~ ${`(^|;)${pattern}(;|$)`}`
}

/**
 * One row per item and region with that region's current observation: the
 * newest one with a price (by checked date, then creation time). A "no price
 * found" observation is current only where no price was ever recorded, however
 * new it is. An item without any observation appears once with `price: null`.
 * Regions are told apart by `regionKey`, so "NCR" and "ncr" give one row.
 * A region filter (any letter case) keeps only items observed in that region,
 * except with the "no source" status, which also lists the items with no
 * observation there. The price-status filters read this current observation,
 * so "no source" means: no price in any observation, or no observation at all.
 */
export async function listCatalogueItems(
  actor: CatalogueActor,
  rawFilters: unknown = {},
): Promise<CatalogueResult<CatalogueListResult>> {
  const denied = catalogueAccessDenial(actor.role, 'catalogue.read')
  if (denied) return denied

  const parsed = catalogueListFiltersSchema.safeParse(rawFilters)
  if (!parsed.success) {
    const issue = parsed.error.errors[0]
    return {
      ok: false,
      status: 400,
      error: `${issue?.path.join('.') || 'filters'}: ${issue?.message ?? 'invalid'}`,
    }
  }
  const filters: CatalogueListFilters = parsed.data

  const current = db
    .selectDistinctOn([cataloguePrices.item_id, regionKey], {
      price_id: cataloguePrices.id,
      tenant_id: cataloguePrices.tenant_id,
      item_id: cataloguePrices.item_id,
      region: cataloguePrices.region,
      price_low_centavos: cataloguePrices.price_low_centavos,
      price_avg_centavos: cataloguePrices.price_avg_centavos,
      price_high_centavos: cataloguePrices.price_high_centavos,
      price_basis: cataloguePrices.price_basis,
      source_kind: cataloguePrices.source_kind,
      source_name: cataloguePrices.source_name,
      source_url: cataloguePrices.source_url,
      checked_on: cataloguePrices.checked_on,
      flag: cataloguePrices.flag,
      notes: cataloguePrices.notes,
    })
    .from(cataloguePrices)
    .where(
      and(
        eq(cataloguePrices.tenant_id, actor.tenantId),
        filters.region ? inRegion(filters.region) : undefined,
      ),
    )
    // The current-price order: priced before unpriced (`is null` sorts false
    // before true), then checked_on desc, then created_at desc. The item
    // page's current query in getCatalogueItemDetail uses the same order.
    .orderBy(
      cataloguePrices.item_id,
      regionKey,
      isNull(cataloguePrices.price_avg_centavos),
      desc(cataloguePrices.checked_on),
      desc(cataloguePrices.created_at),
    )
    .as('current_price')

  const conditions: SQL[] = [eq(catalogueItems.tenant_id, actor.tenantId)]
  if (filters.q) {
    const pattern = `%${escapeLikePattern(filters.q)}%`
    const search = or(ilike(catalogueItems.code, pattern), ilike(catalogueItems.name, pattern))
    if (search) conditions.push(search)
  }
  if (filters.trade) conditions.push(eq(catalogueItems.trade, filters.trade))
  if (filters.region && filters.status !== 'no_source') {
    conditions.push(isNotNull(current.price_id))
  }
  if (filters.status === 'priced') conditions.push(isNotNull(current.price_avg_centavos))
  if (filters.status === 'no_source') conditions.push(isNull(current.price_avg_centavos))
  if (filters.status === 'stale') conditions.push(flagHasToken(current.flag, 'STALE_[0-9]{4}'))
  if (filters.status === 'low_authority') {
    conditions.push(flagHasToken(current.flag, 'LOW_AUTHORITY'))
  }
  const whereClause = and(...conditions)
  const joinCurrent = and(
    eq(current.item_id, catalogueItems.id),
    eq(current.tenant_id, catalogueItems.tenant_id),
  )
  const offset = (filters.page - 1) * CATALOGUE_PAGE_SIZE

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: catalogueItems.id,
        code: catalogueItems.code,
        name: catalogueItems.name,
        trade: catalogueItems.trade,
        specification: catalogueItems.specification,
        unit: catalogueItems.unit,
        is_active: catalogueItems.is_active,
        price_id: current.price_id,
        region: current.region,
        price_low_centavos: current.price_low_centavos,
        price_avg_centavos: current.price_avg_centavos,
        price_high_centavos: current.price_high_centavos,
        price_basis: current.price_basis,
        source_kind: current.source_kind,
        source_name: current.source_name,
        source_url: current.source_url,
        checked_on: current.checked_on,
        flag: current.flag,
        notes: current.notes,
      })
      .from(catalogueItems)
      .leftJoin(current, joinCurrent)
      .where(whereClause)
      .orderBy(asc(catalogueItems.code), asc(current.region))
      .limit(CATALOGUE_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(catalogueItems)
      .leftJoin(current, joinCurrent)
      .where(whereClause),
  ])

  const total = Number(countRows[0]?.count ?? 0)
  return {
    ok: true,
    data: {
      rows: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        trade: row.trade,
        specification: row.specification,
        unit: row.unit,
        is_active: row.is_active,
        price:
          row.price_id && row.region && row.source_kind && row.checked_on
            ? {
                id: row.price_id,
                region: row.region,
                price_low_centavos: row.price_low_centavos,
                price_avg_centavos: row.price_avg_centavos,
                price_high_centavos: row.price_high_centavos,
                price_basis: row.price_basis,
                source_kind: row.source_kind,
                source_name: row.source_name,
                source_url: row.source_url,
                checked_on: row.checked_on,
                flags: splitCatalogueFlags(row.flag),
                notes: row.notes,
              }
            : null,
      })),
      total,
      page: filters.page,
      limit: CATALOGUE_PAGE_SIZE,
      totalPages: total === 0 ? 1 : Math.ceil(total / CATALOGUE_PAGE_SIZE),
      filters,
    },
  }
}

export interface CatalogueItemDetail {
  item: CatalogueItem
  /** The price observations, newest first: at most CATALOGUE_HISTORY_LIMIT of them. */
  history: CataloguePrice[]
  /** True when older observations exist beyond `history`. */
  historyCapped: boolean
  /**
   * The current observation in each region the item has one in, from all of
   * its observations: one may be older than the newest CATALOGUE_HISTORY_LIMIT.
   */
  current: CataloguePrice[]
}

/** One item with its price history. Another tenant's item reads as not-found. */
export async function getCatalogueItemDetail(
  actor: CatalogueActor,
  itemId: string,
): Promise<CatalogueResult<CatalogueItemDetail>> {
  const denied = catalogueAccessDenial(actor.role, 'catalogue.read')
  if (denied) return denied
  if (!z.string().uuid().safeParse(itemId).success) {
    return { ok: false, status: 404, error: 'Catalogue item not found' }
  }

  const [item] = await db
    .select()
    .from(catalogueItems)
    .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.tenant_id, actor.tenantId)))
    .limit(1)
  if (!item) return { ok: false, status: 404, error: 'Catalogue item not found' }

  const itemPrices = and(
    eq(cataloguePrices.item_id, itemId),
    eq(cataloguePrices.tenant_id, actor.tenantId),
  )
  const [newest, current] = await Promise.all([
    // shortcut: newest 500 observations only, add paging when an item outgrows it.
    // One more is read so the page can say when older ones were left out.
    db
      .select()
      .from(cataloguePrices)
      .where(itemPrices)
      .orderBy(desc(cataloguePrices.checked_on), desc(cataloguePrices.created_at))
      .limit(CATALOGUE_HISTORY_LIMIT + 1),
    // The current entry of each region, read from every observation rather
    // than from the capped history: the same rule and order as the list.
    db
      .selectDistinctOn([regionKey])
      .from(cataloguePrices)
      .where(itemPrices)
      .orderBy(
        regionKey,
        isNull(cataloguePrices.price_avg_centavos),
        desc(cataloguePrices.checked_on),
        desc(cataloguePrices.created_at),
      ),
  ])

  return {
    ok: true,
    data: {
      item,
      history: newest.slice(0, CATALOGUE_HISTORY_LIMIT),
      historyCapped: newest.length > CATALOGUE_HISTORY_LIMIT,
      current,
    },
  }
}
