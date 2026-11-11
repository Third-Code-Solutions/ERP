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
  Truncated,
  pesos,
  tradeLabel,
} from '../catalogue-display'
import { EditItemForm } from './edit-item-form'
import { RecordPriceForm } from './record-price-form'

export const metadata: Metadata = { title: 'Catalogue item' }

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

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

function PriceHistory({ history }: { history: CataloguePrice[] }) {
  return (
    <section className="finance-section">
      <div className="finance-section-heading">
        <div>
          <p className="finance-eyebrow">Price history</p>
          <h2>Every recorded price, newest first</h2>
        </div>
        <p>
          {history.length} recorded price{history.length === 1 ? '' : 's'}. The newest in a region
          is its current price.
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
                <th>Checked</th>
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
              {history.map((price) => (
                <tr key={price.id}>
                  <td>
                    <strong>{formatDate(price.checked_on)}</strong>
                    <span className="finance-cell-detail">
                      {SOURCE_KIND_LABELS[price.source_kind] ?? price.source_kind}
                    </span>
                  </td>
                  <td>{price.region}</td>
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
                    <FlagChips
                      flags={splitCatalogueFlags(price.flag)}
                      priced={price.price_avg_centavos !== null}
                    />
                  </td>
                  <td>
                    <Truncated text={price.notes} />
                  </td>
                </tr>
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
  const { item, history } = result.data

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/catalogue">Price catalogue</Link> · Catalogue item
          </p>
          <h1 className="page-title">{item.code}</h1>
          <p className="page-subtitle">
            The item as catalogued and every price recorded for it, with its source.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/catalogue" className="finance-secondary-link">
            Price catalogue
          </Link>
        </div>
      </div>

      <ItemIdentity item={item} />
      <PriceHistory history={history} />

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
