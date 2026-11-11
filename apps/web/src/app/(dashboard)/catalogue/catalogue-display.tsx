import { Fragment } from 'react'
import { formatCents } from '@third-code-erp/shared-types'
import {
  CATALOGUE_TRADES,
  parseSourceUrl,
  type CataloguePriceStatus,
  type CatalogueTrade,
} from '@/lib/catalogue/rules'

// What the catalogue list and the item page show the same way: trade names,
// peso amounts, long text, flag chips and the source link.

const TRADE_LABELS: Record<CatalogueTrade, string> = {
  earthworks: 'Earthworks',
  concrete: 'Concrete',
  'rebar-structural-steel': 'Rebar and structural steel',
  formwork: 'Formwork',
  masonry: 'Masonry',
  waterproofing: 'Waterproofing',
  roofing: 'Roofing',
  'doors-windows': 'Doors and windows',
  'ceiling-drywall': 'Ceiling and drywall',
  'floor-wall-finishes': 'Floor and wall finishes',
  paint: 'Paint',
  'plumbing-sanitary': 'Plumbing and sanitary',
  electrical: 'Electrical',
  'fire-protection': 'Fire protection',
  'mechanical-hvac': 'Mechanical and HVAC',
  'road-bridge-works': 'Road and bridge works',
  drainage: 'Drainage',
  'site-safety': 'Site safety',
  labor: 'Labour',
  equipment: 'Equipment',
}

export const TRADE_OPTIONS = CATALOGUE_TRADES.map(({ slug }) => ({
  slug,
  label: TRADE_LABELS[slug],
}))

export function tradeLabel(trade: string): string {
  return (TRADE_LABELS as Record<string, string>)[trade] ?? trade
}

export const PRICE_STATUS_LABELS: Record<CataloguePriceStatus, string> = {
  priced: 'Priced',
  no_source: 'No source',
  stale: 'Before 2026',
  low_authority: 'Low authority',
}

export function pesos(centavos: number | null): string {
  return centavos === null ? '—' : formatCents(centavos)
}

const CELL_TEXT_LENGTH = 80

/**
 * Long text cut for a cell of the list table. The hover title is a
 * convenience only: the item page shows the same text in full.
 */
export function Truncated({ text }: { text: string | null }) {
  if (!text) return <>—</>
  if (text.length <= CELL_TEXT_LENGTH) return <>{text}</>
  return <span title={text}>{text.slice(0, CELL_TEXT_LENGTH - 1).trimEnd()}…</span>
}

const NEUTRAL = 'finance-status-draft'
const CAUTION = 'finance-status-maintenance'
const FLAG_CHIPS: Record<string, { label: string; variant: string }> = {
  NO_SOURCE: { label: 'No source', variant: NEUTRAL },
  SINGLE_SOURCE: { label: 'One source', variant: NEUTRAL },
  NON_NCR: { label: 'Not Metro Manila', variant: NEUTRAL },
  LOW_AUTHORITY: { label: 'Low authority', variant: CAUTION },
  SNIPPET_ONLY: { label: 'Search excerpt only', variant: CAUTION },
}

/** The flags of an observation as worded chips. */
export function FlagChips({ flags }: { flags: string[] }) {
  return (
    <>
      {flags.map((flag) => {
        const staleYear = /^STALE_(\d{4})$/.exec(flag)?.[1]
        const chip = staleYear
          ? { label: 'Before 2026', variant: CAUTION }
          : (FLAG_CHIPS[flag] ?? { label: flag, variant: NEUTRAL })
        return (
          <Fragment key={flag}>
            <span
              className={`finance-status ${chip.variant}`}
              title={staleYear ? `Newest figure found is from ${staleYear}` : undefined}
            >
              {chip.label}
            </span>{' '}
          </Fragment>
        )
      })}
    </>
  )
}

/**
 * The source as an external link named by its host. Only a URL that passes the
 * catalogue's own check is linked; otherwise the source name stands alone.
 */
export function SourceLink({ url, name }: { url: string | null; name: string | null }) {
  const parsed = url ? parseSourceUrl(url) : null
  if (!parsed?.ok) return <>{name ?? '—'}</>
  return (
    <a href={parsed.href} target="_blank" rel="noopener noreferrer">
      {new URL(parsed.href).hostname.replace(/^www\./, '')}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
