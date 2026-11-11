import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { catalogueEnabled } from '@/lib/catalogue/access'
import {
  CATALOGUE_MAX_SEARCH_LENGTH,
  catalogueListFiltersSchema,
  listCatalogueItems,
  type CatalogueListFilters,
  type CatalogueListResult,
} from '@/lib/catalogue/queries'
import { CATALOGUE_LIMITS, CATALOGUE_PRICE_STATUSES } from '@/lib/catalogue/rules'
import {
  FlagChips,
  PRICE_STATUS_LABELS,
  SourceLink,
  TRADE_OPTIONS,
  Truncated,
  formatDate,
  pesos,
  tradeLabel,
} from './catalogue-display'

export const metadata: Metadata = { title: 'Price catalogue' }

type CatalogueSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** The current search state with another page number, without blank filters. */
function pageQuery(filters: CatalogueListFilters, page: number) {
  return Object.fromEntries(
    Object.entries({ ...filters, page: String(page) }).filter(([, value]) => value !== undefined),
  )
}

function CatalogueFilters({ filters }: { filters: CatalogueListFilters }) {
  return (
    <form className="ledger-filters" method="get">
      <div className="finance-field finance-field-grow">
        <label htmlFor="catalogue-search">Search catalogue</label>
        <input
          id="catalogue-search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Code or name"
          maxLength={CATALOGUE_MAX_SEARCH_LENGTH}
        />
      </div>
      <div className="finance-field">
        <label htmlFor="catalogue-trade">Trade</label>
        <select id="catalogue-trade" name="trade" defaultValue={filters.trade ?? ''}>
          <option value="">All trades</option>
          {TRADE_OPTIONS.map((trade) => (
            <option key={trade.slug} value={trade.slug}>
              {trade.label}
            </option>
          ))}
        </select>
      </div>
      <div className="finance-field">
        <label htmlFor="catalogue-region">Region</label>
        <input
          id="catalogue-region"
          name="region"
          defaultValue={filters.region ?? ''}
          placeholder="NCR"
          maxLength={CATALOGUE_LIMITS.region}
        />
      </div>
      <div className="finance-field">
        <label htmlFor="catalogue-status">Price status</label>
        <select id="catalogue-status" name="status" defaultValue={filters.status ?? ''}>
          <option value="">All statuses</option>
          {CATALOGUE_PRICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PRICE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="finance-primary-link">
        Filter
      </button>
    </form>
  )
}

function CatalogueRegister({ data }: { data: CatalogueListResult }) {
  return (
    <>
      <CatalogueFilters filters={data.filters} />
      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Current prices</p>
            <h2>Materials, labour and equipment</h2>
          </div>
          <p>
            One row per item and region. Check a price with a supplier before it goes into a bid.
          </p>
        </div>
        <div className="finance-table-shell">
          {data.rows.length === 0 ? (
            <div className="card-empty">
              <p>No catalogue items match current filters.</p>
              <Link href="/catalogue">Clear filters</Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Trade</th>
                  <th>Specification</th>
                  <th>Unit</th>
                  <th className="numeric">Low</th>
                  <th className="numeric">Average</th>
                  <th className="numeric">High</th>
                  <th>Region</th>
                  <th>Source</th>
                  <th>Checked date</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(({ price, ...item }) => (
                  <tr key={`${item.id}:${price?.region ?? ''}`}>
                    <td>
                      <Link href={`/catalogue/${item.id}`}>
                        <strong>{item.code}</strong>
                      </Link>
                      <span className="finance-cell-detail">{item.name}</span>
                    </td>
                    <td>{tradeLabel(item.trade)}</td>
                    <td>
                      <Truncated text={item.specification} />
                    </td>
                    <td>{item.unit}</td>
                    {price?.price_avg_centavos != null ? (
                      <>
                        <td className="currency">{pesos(price.price_low_centavos)}</td>
                        <td className="currency">{pesos(price.price_avg_centavos)}</td>
                        <td className="currency">{pesos(price.price_high_centavos)}</td>
                      </>
                    ) : (
                      // No price: the note that says why takes the place of the amounts.
                      <td colSpan={3}>
                        <Truncated text={price?.notes ?? null} />
                      </td>
                    )}
                    <td>{price?.region ?? '—'}</td>
                    <td>
                      <SourceLink url={price?.source_url ?? null} name={price?.source_name ?? null} />
                    </td>
                    <td>{formatDate(price?.checked_on ?? null)}</td>
                    <td>
                      {/* No observation (in the filtered region) counts as no source. */}
                      <FlagChips flags={price?.flags ?? ['NO_SOURCE']} />
                      {item.is_active ? null : (
                        <span className="finance-status finance-status-closed">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="finance-record-list" aria-label="Price catalogue pagination">
          <div className="finance-record">
            <div>
              <strong>
                Page {data.page} of {data.totalPages}
              </strong>
              <span>
                {data.total.toLocaleString('en-PH')} rows · {data.limit} per page
              </span>
            </div>
            <div className="finance-header-actions">
              {data.page > 1 && (
                <Link
                  className="finance-secondary-link"
                  href={{ pathname: '/catalogue', query: pageQuery(data.filters, data.page - 1) }}
                >
                  Previous
                </Link>
              )}
              {data.page < data.totalPages && (
                <Link
                  className="finance-secondary-link"
                  href={{ pathname: '/catalogue', query: pageQuery(data.filters, data.page + 1) }}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<CatalogueSearchParams>
}) {
  if (!catalogueEnabled()) notFound()
  const profile = await requireUserProfile()
  requireCapability(profile, 'catalogue.read')

  const params = await searchParams
  const parsed = catalogueListFiltersSchema.safeParse({
    q: first(params.q),
    trade: first(params.trade),
    region: first(params.region),
    status: first(params.status),
    page: first(params.page),
  })
  // Bad filters stop here: the list is only queried with a search state that parsed.
  const result = parsed.success ? await listCatalogueItems(profile, parsed.data) : null
  if (result && !result.ok && result.status !== 400) {
    if (result.status === 404) notFound()
    throw new Error(result.error)
  }

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/purchase-orders">Commercial</Link> · Reference prices
          </p>
          <h1 className="page-title">Price catalogue</h1>
          <p className="page-subtitle">
            Market reference prices for materials, labour and equipment, each with its source and
            the date it was checked.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/purchase-orders" className="finance-secondary-link">
            Purchase orders
          </Link>
        </div>
      </div>

      {result?.ok ? (
        <CatalogueRegister data={result.data} />
      ) : (
        <section className="finance-section" aria-live="polite">
          <div className="card-empty">
            <p>
              <strong>Filters need review</strong>
            </p>
            <p>Use the catalogue filters and try again. No query was run.</p>
            <Link href="/catalogue">Reset filters</Link>
          </div>
        </section>
      )}
    </div>
  )
}
