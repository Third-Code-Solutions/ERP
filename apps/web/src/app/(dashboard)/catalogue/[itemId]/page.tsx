import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import type { CatalogueItem, CataloguePrice } from '@third-code-erp/database/schema'
import { catalogueEnabled } from '@/lib/catalogue/access'
import { getCatalogueItemDetail } from '@/lib/catalogue/queries'
import { manilaToday, splitCatalogueFlags } from '@/lib/catalogue/rules'
import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import {
  FlagChips,
  SourceLink,
  TRADE_OPTIONS,
  formatDate,
  ownLabel,
  pesos,
  tradeLabel,
} from '../catalogue-display'
import { EditItemForm } from './edit-item-form'
import { RecordPriceForm } from './record-price-form'

export const metadata: Metadata = { title: 'Catalogue item' }

const SOURCE_KIND_LABELS: Record<string, string> = {
  research: 'Research',
  supplier: 'Supplier price list',
  manual: 'Entered by hand',
}

/** "material_supply;incl_VAT" reads "material supply · incl VAT". */
function basisText(basis: string | null): string {
  return basis ? basis.replaceAll('_', ' ').replaceAll(';', ' · ') : '—'
}

function ItemIdentity({ item }: { item: CatalogueItem }) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Item identity</p>
          <h2>{item.name}</h2>
        </div>
        <span
          className={`finance-status ${item.is_active ? 'finance-status-open' : 'finance-status-closed'}`}
        >
          {item.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="finance-record-list">
        <div className="finance-record">
          <div>
            <strong>Trade</strong>
            <span>{tradeLabel(item.trade)}</span>
          </div>
        </div>
        <div className="finance-record">
          <div>
            <strong>Unit</strong>
            <span>{item.unit}</span>
          </div>
        </div>
        <div className="finance-record">
          <div>
            <strong>Specification</strong>
            <span>{item.specification ?? '—'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function PriceRow({
  price,
  isCurrent,
  pinned = false,
}: {
  price: CataloguePrice
  isCurrent: boolean
  /** A current entry older than the history shown, pinned above it. */
  pinned?: boolean
}) {
  return (
    <tr>
      <td>
        <strong>{formatDate(price.checked_on)}</strong>
        <span className="finance-cell-detail">
          {ownLabel(SOURCE_KIND_LABELS, price.source_kind) ?? price.source_kind}
        </span>
        {pinned ? (
          <span className="finance-cell-detail">Older than the entries listed below</span>
        ) : null}
      </td>
      <td>
        {price.region}
        {isCurrent ? (
          <>
            {' '}
            <span className="finance-status finance-status-open">Current</span>
          </>
        ) : null}
      </td>
      <td className="currency">{pesos(price.price_low_centavos)}</td>
      <td className="currency">{pesos(price.price_avg_centavos)}</td>
      <td className="currency">{pesos(price.price_high_centavos)}</td>
      <td>{basisText(price.price_basis)}</td>
      <td>
        <SourceLink url={price.source_url} name={price.source_name} />
        {price.source_url && price.source_name ? (
          <span className="finance-cell-detail">{price.source_name}</span>
        ) : null}
      </td>
      <td>
        <FlagChips flags={splitCatalogueFlags(price.flag)} />
      </td>
      <td>{price.notes ?? '—'}</td>
    </tr>
  )
}

function PriceHistory({
  history,
  capped,
  current,
}: {
  history: CataloguePrice[]
  capped: boolean
  /** The current entry of each region, read from every observation. */
  current: CataloguePrice[]
}) {
  const currentIds = new Set(current.map((price) => price.id))
  const shownIds = new Set(history.map((price) => price.id))
  // A region's current entry can be older than the capped history: pin it on top.
  const pinned = current.filter((price) => !shownIds.has(price.id))
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Price history</p>
          <h2>Recorded entries, newest first</h2>
        </div>
        <p>
          {capped
            ? `Only the newest ${history.length} entries are shown; older ones are not listed here${
                pinned.length > 0
                  ? ', except the current entry of a region, which is pinned at the top.'
                  : '.'
              }`
            : `${history.length} ${history.length === 1 ? 'entry' : 'entries'}.`}{' '}
          In each region the current entry, marked Current, is the newest one with a price, or
          the newest one where no price was ever found there.
        </p>
      </div>
      <div className="finance-table-shell">
        {history.length === 0 ? (
          <div className="card-empty">
            <p>No price recorded yet.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Checked date</th>
                <th>Region</th>
                <th className="numeric">Low</th>
                <th className="numeric">Average</th>
                <th className="numeric">High</th>
                <th>Basis</th>
                <th>Source</th>
                <th>Flags</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {pinned.map((price) => (
                <PriceRow key={price.id} price={price} isCurrent pinned />
              ))}
              {history.map((price) => (
                <PriceRow key={price.id} price={price} isCurrent={currentIds.has(price.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default async function CatalogueItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  if (!catalogueEnabled()) notFound()
  const profile = await requireUserProfile()
  requireCapability(profile, 'catalogue.read')
  const { itemId } = await requireUuidRouteParams(params)

  // A missing item and another tenant's item both read as not-found.
  const result = await getCatalogueItemDetail(profile, itemId)
  if (!result.ok) {
    if (result.status === 404) notFound()
    throw new Error(result.error)
  }
  const { item, history, historyCapped, current } = result.data

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/catalogue">Price catalogue</Link> · Catalogue item
          </p>
          <h1 className="page-title">{item.code}</h1>
          <p className="page-subtitle">
            The item as catalogued and the prices recorded for it, each with its source.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/catalogue" className="finance-secondary-link">
            Price catalogue
          </Link>
        </div>
      </div>

      <ItemIdentity item={item} />
      <PriceHistory history={history} capped={historyCapped} current={current} />

      {can(profile.role, 'catalogue.manage') ? (
        <>
          <section className="finance-section">
            <div className="finance-section-heading">
              <div>
                <p className="finance-eyebrow">Catalogue admin</p>
                <h2>Edit item</h2>
              </div>
              <p>The code stays as it is. Every change is written to the audit log.</p>
            </div>
            <EditItemForm
              item={{
                id: item.id,
                name: item.name,
                specification: item.specification,
                unit: item.unit,
                trade: item.trade,
                is_active: item.is_active,
              }}
              trades={TRADE_OPTIONS}
            />
          </section>
          <section className="finance-section">
            <div className="finance-section-heading">
              <div>
                <p className="finance-eyebrow">Catalogue admin</p>
                <h2>Record a price</h2>
              </div>
              <p>Adds a price to the history. Earlier prices are kept: a correction is a new entry.</p>
            </div>
            <RecordPriceForm itemId={item.id} today={manilaToday()} />
          </section>
        </>
      ) : null}
    </div>
  )
}
