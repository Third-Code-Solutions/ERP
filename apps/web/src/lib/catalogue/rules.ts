import { manilaCalendarDate } from '@third-code-erp/shared-types/common'
import { cellCentavos, type CellNumberProblem } from '../operations/boq-excel/cells'

/**
 * Pure rules of the master price catalogue (docs/erp/specs/catalogue.md),
 * shared by the web app and scripts/seed-catalogue.mjs. Keep this file free of
 * database, framework and `@/` alias imports: the seed script loads it in
 * plain Node through scripts/lib/import-typescript.mjs.
 */

export const CATALOGUE_TRADES = [
  { slug: 'earthworks', prefix: 'EW' },
  { slug: 'concrete', prefix: 'CN' },
  { slug: 'rebar-structural-steel', prefix: 'RS' },
  { slug: 'formwork', prefix: 'FW' },
  { slug: 'masonry', prefix: 'MS' },
  { slug: 'waterproofing', prefix: 'WP' },
  { slug: 'roofing', prefix: 'RF' },
  { slug: 'doors-windows', prefix: 'DW' },
  { slug: 'ceiling-drywall', prefix: 'CD' },
  { slug: 'floor-wall-finishes', prefix: 'FF' },
  { slug: 'paint', prefix: 'PT' },
  { slug: 'plumbing-sanitary', prefix: 'PL' },
  { slug: 'electrical', prefix: 'EL' },
  { slug: 'fire-protection', prefix: 'FP' },
  { slug: 'mechanical-hvac', prefix: 'MH' },
  { slug: 'road-bridge-works', prefix: 'RB' },
  { slug: 'drainage', prefix: 'DR' },
  { slug: 'site-safety', prefix: 'SS' },
  { slug: 'labor', prefix: 'LB' },
  { slug: 'equipment', prefix: 'EQ' },
] as const

export type CatalogueTrade = (typeof CATALOGUE_TRADES)[number]['slug']

const [firstTrade, ...otherTrades] = CATALOGUE_TRADES.map((trade) => trade.slug)
/** Non-empty tuple, usable as `z.enum(CATALOGUE_TRADE_SLUGS)`. */
export const CATALOGUE_TRADE_SLUGS: [CatalogueTrade, ...CatalogueTrade[]] = [
  firstTrade!,
  ...otherTrades,
]

export function isCatalogueTrade(value: string): value is CatalogueTrade {
  return CATALOGUE_TRADES.some((trade) => trade.slug === value)
}

export const CATALOGUE_SEED_CODE = /^[A-Z]{2}-[0-9]{4}$/

/** True when a seeded code carries the prefix of its trade ("CN-0001", concrete). */
export function codeMatchesTrade(code: string, trade: CatalogueTrade): boolean {
  const prefix = CATALOGUE_TRADES.find((entry) => entry.slug === trade)?.prefix
  return CATALOGUE_SEED_CODE.test(code) && code.slice(0, 2) === prefix
}

export const CATALOGUE_LIMITS = {
  name: 300,
  specification: 2_000,
  unit: 20,
  region: 40,
  priceBasis: 60,
  sourceName: 200,
  sourceUrl: 2_000,
  flag: 200,
  notes: 2_000,
} as const

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export const CATALOGUE_FLAG_TOKENS = [
  'NO_SOURCE',
  'SINGLE_SOURCE',
  'NON_NCR',
  'LOW_AUTHORITY',
  'SNIPPET_ONLY',
] as const
const STALE_FLAG = /^STALE_[0-9]{4}$/

export function isCatalogueFlagToken(token: string): boolean {
  return (CATALOGUE_FLAG_TOKENS as readonly string[]).includes(token) || STALE_FLAG.test(token)
}

/** "SINGLE_SOURCE;STALE_2024" -> tokens. Blank text has no tokens. */
export function splitCatalogueFlags(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
}

/** First problem with a `;`-separated flag field, or null when it is valid. */
export function catalogueFlagProblem(text: string): string | null {
  const tokens = splitCatalogueFlags(text)
  const unknown = tokens.find((token) => !isCatalogueFlagToken(token))
  if (unknown) return `unknown flag token "${unknown}"`
  if (new Set(tokens).size !== tokens.length) return 'flag tokens must not repeat'
  return null
}

/** Price status filters of the catalogue page. */
export const CATALOGUE_PRICE_STATUSES = ['priced', 'no_source', 'stale', 'low_authority'] as const
export type CataloguePriceStatus = (typeof CATALOGUE_PRICE_STATUSES)[number]

// ---------------------------------------------------------------------------
// Text hygiene (applied when text is written; formula-like text is left alone
// here and neutralised at export time)
// ---------------------------------------------------------------------------

// Tabs and every line break, the Unicode line and paragraph separators included.
const LINE_BREAKS_AND_TABS = /[\t\n\r\u2028\u2029]+/g
const LINE_BREAKS = /\r\n?|[\u2028\u2029]/g
// Characters that are invisible or reorder text, so stored text could read
// differently from what it holds: C0 controls except tab, line feed and
// carriage return; DEL and the C1 controls; the Arabic letter mark (U+061C);
// the Mongolian vowel separator (U+180E); zero-width spaces, joiners and
// direction marks (U+200B-U+200F); bidirectional embeddings and overrides
// (U+202A-U+202E); the word joiner and the invisible operators
// (U+2060-U+2064); bidirectional isolates and the deprecated format controls
// (U+2066-U+206F); the Hangul fillers (U+3164, U+FFA0); the byte order mark;
// tag characters (U+E0000-U+E007F); and lone surrogates, which are not text at
// all (the same check as boq-excel's INVALID_TEXT). The u flag reads a
// surrogate pair as one character, so U+D800-U+DFFF matches only a lone one.
const HIDDEN_OR_CONTROL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0\u{E0000}-\u{E007F}\uD800-\uDFFF]/gu

/** One-line field: tabs and line breaks become a space, hidden characters go. */
export function cleanSingleLine(value: string): string {
  return value.replace(LINE_BREAKS_AND_TABS, ' ').replace(HIDDEN_OR_CONTROL, '').trim()
}

/**
 * Multi-line field: keeps tabs, and keeps line breaks as line feeds only (CR LF,
 * CR, U+2028 and U+2029 become LF); hidden characters go.
 */
export function cleanMultiLine(value: string): string {
  return value.replace(LINE_BREAKS, '\n').replace(HIDDEN_OR_CONTROL, '').trim()
}

// ---------------------------------------------------------------------------
// Source URL
// ---------------------------------------------------------------------------

export type SourceUrlResult = { ok: true; href: string } | { ok: false; error: string }

/**
 * Accepts only an absolute http(s) URL without credentials or whitespace and
 * returns the parsed `href` to store. The URL is never fetched.
 */
export function parseSourceUrl(value: string): SourceUrlResult {
  if (/\s/.test(value)) return { ok: false, error: 'source URL must not contain whitespace' }
  if (!URL.canParse(value)) return { ok: false, error: 'source URL is not a valid URL' }
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'source URL must start with http:// or https://' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'source URL must not contain a username or password' }
  }
  if (url.href.length > CATALOGUE_LIMITS.sourceUrl) {
    return { ok: false, error: `source URL must be at most ${CATALOGUE_LIMITS.sourceUrl} characters` }
  }
  return { ok: true, href: url.href }
}

// ---------------------------------------------------------------------------
// Checked date
// ---------------------------------------------------------------------------

/** Today's calendar date in Manila, "YYYY-MM-DD". */
export function manilaToday(now: Date = new Date()): string {
  return manilaCalendarDate(now)
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * A price may not be dated after today in Manila: the current price is the
 * newest `checked_on`, so a future date could never be superseded.
 */
export function checkedOnProblem(value: string, today: string = manilaToday()): string | null {
  if (!isCalendarDate(value)) return 'checked date must be a real date in YYYY-MM-DD form'
  // ISO dates compare as strings.
  if (value > today) return `checked date ${value} is after today (${today}, Manila)`
  return null
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** PHP 99,999,999,999.99: far below 2^53, so centavos stay exact numbers. */
export const MAX_CATALOGUE_PRICE_CENTAVOS = 9_999_999_999_999

export type CentavosResult =
  | { ok: true; centavos: number }
  | { ok: false; problem: CellNumberProblem }

/**
 * PHP decimal string -> integer centavos, half-up at the centavo. Uses the
 * boq-excel decimal-string parser, so "1,234.565" and "₱ 1234.565" both give
 * 123457 and no float arithmetic is involved.
 */
export function phpToCentavos(text: string): CentavosResult {
  const parsed = cellCentavos(text, MAX_CATALOGUE_PRICE_CENTAVOS)
  return parsed.ok ? { ok: true, centavos: parsed.value } : parsed
}

export interface CataloguePriceRange {
  low: number
  avg: number
  high: number
}

/** 0 <= low <= avg <= high, in whole centavos. Null when the range is valid. */
export function priceRangeProblem({ low, avg, high }: CataloguePriceRange): string | null {
  if (![low, avg, high].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return 'prices must be whole, non-negative centavos'
  }
  if (low > avg) return 'low price must not be above the average price'
  if (avg > high) return 'average price must not be above the high price'
  return null
}

// ---------------------------------------------------------------------------
// Current price
// ---------------------------------------------------------------------------

export interface DatedObservation {
  region: string
  /** "YYYY-MM-DD" */
  checked_on: string
  created_at: Date
  /** Null when the observation found no price. */
  price_avg_centavos: number | null
}

/** Newest first: by checked date, then by when the row was recorded. */
export function compareNewestFirst(a: DatedObservation, b: DatedObservation): number {
  if (a.checked_on !== b.checked_on) return a.checked_on < b.checked_on ? 1 : -1
  return b.created_at.getTime() - a.created_at.getTime()
}

/**
 * The order the current observation is taken from: priced ones first, each
 * group newest first. A price always beats a "no price found" entry, however
 * new that entry is, so re-seeding the research files can never hide a price a
 * person recorded. The list query orders its rows the same way in SQL.
 */
export function compareCurrentFirst(a: DatedObservation, b: DatedObservation): number {
  const unpriced = Number(a.price_avg_centavos === null) - Number(b.price_avg_centavos === null)
  return unpriced || compareNewestFirst(a, b)
}

/**
 * The current observation of an item in each region: the newest one with a
 * price, or the newest one of all where no price was ever recorded there.
 * Keyed by the region trimmed and in lower case, so "NCR" and "ncr" are one
 * region, as in the SQL (`regionKey` in queries.ts).
 */
export function currentPriceByRegion<T extends DatedObservation>(
  observations: readonly T[],
): Map<string, T> {
  const current = new Map<string, T>()
  for (const observation of [...observations].sort(compareCurrentFirst)) {
    const region = observation.region.trim().toLowerCase()
    if (!current.has(region)) current.set(region, observation)
  }
  return current
}
