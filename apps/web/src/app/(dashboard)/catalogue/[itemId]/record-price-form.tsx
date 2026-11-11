'use client'

import { useActionState } from 'react'
import { CATALOGUE_LIMITS, MAX_CATALOGUE_PRICE_CENTAVOS } from '@/lib/catalogue/rules'
import { recordCataloguePrice } from '../actions'

type RecordState =
  | { recorded: true; current: boolean; region: string }
  | { error: string; sent: FormData }
  | null

async function recordPrice(_previous: RecordState, formData: FormData): Promise<RecordState> {
  const result = await recordCataloguePrice(formData)
  return result.ok
    ? { recorded: true, current: result.data.current, region: result.data.region }
    : { error: result.error, sent: formData }
}

/** `today` is today's date in Manila ("YYYY-MM-DD"): a price cannot be dated later. */
export function RecordPriceForm({ itemId, today }: { itemId: string; today: string }) {
  const [state, record, pending] = useActionState(recordPrice, null)
  // React resets the form after every submit. A refused price resets it to
  // what was typed; a recorded one clears it for the next entry.
  const sent = state && 'sent' in state ? state.sent : null
  const typed = (name: string, blank = '') => (sent ? String(sent.get(name) ?? '') : blank)
  const pesos = (name: string) => ({
    id: `price-${name}`,
    name,
    type: 'number',
    min: 0,
    // The most the catalogue stores, in pesos: 99999999999.99.
    max: MAX_CATALOGUE_PRICE_CENTAVOS / 100,
    step: '0.01',
    defaultValue: typed(name),
    'aria-describedby': 'price-hint',
  })

  return (
    <form action={record} className="finance-setup-form">
      <input type="hidden" name="item_id" value={itemId} />
      <div className="finance-field">
        <label htmlFor="price-price_php">Single price (₱)</label>
        <input {...pesos('price_php')} />
      </div>
      <div className="finance-field">
        <label htmlFor="price-price_low_php">Low (₱)</label>
        <input {...pesos('price_low_php')} />
      </div>
      <div className="finance-field">
        <label htmlFor="price-price_avg_php">Average (₱)</label>
        <input {...pesos('price_avg_php')} />
      </div>
      <div className="finance-field">
        <label htmlFor="price-price_high_php">High (₱)</label>
        <input {...pesos('price_high_php')} />
      </div>
      <div className="finance-field">
        <label htmlFor="price-region">Region</label>
        <input
          id="price-region"
          name="region"
          defaultValue={typed('region', 'NCR')}
          maxLength={CATALOGUE_LIMITS.region}
          required
        />
      </div>
      <div className="finance-field">
        <label htmlFor="price-checked">Checked date</label>
        <input
          id="price-checked"
          name="checked_on"
          type="date"
          defaultValue={typed('checked_on', today)}
          max={today}
          required
        />
      </div>
      <div className="finance-field">
        <label htmlFor="price-basis">Price basis</label>
        <input
          id="price-basis"
          name="price_basis"
          defaultValue={typed('price_basis')}
          placeholder="material_supply;incl_VAT"
          maxLength={CATALOGUE_LIMITS.priceBasis}
        />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="price-source-name">Source name</label>
        <input
          id="price-source-name"
          name="source_name"
          defaultValue={typed('source_name')}
          maxLength={CATALOGUE_LIMITS.sourceName}
          aria-describedby="price-hint"
        />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="price-source-url">Source URL</label>
        <input
          id="price-source-url"
          name="source_url"
          type="url"
          defaultValue={typed('source_url')}
          placeholder="https://"
          maxLength={CATALOGUE_LIMITS.sourceUrl}
          aria-describedby="price-hint"
        />
      </div>
      <button type="submit" className="finance-primary-button" disabled={pending}>
        {pending ? 'Recording…' : 'Record price'}
      </button>
      <p id="price-hint" className="finance-form-hint">
        Give a single price, or low, average and high. Give a source name or a source URL.
      </p>
      {state && 'error' in state ? (
        <p role="alert" className="finance-form-error">
          {state.error}
        </p>
      ) : null}
      {state && 'recorded' in state ? (
        <p role="status" className="finance-form-hint">
          {state.current
            ? 'Price recorded.'
            : `Price recorded. It is not the current price in ${state.region}: a price checked on a later date is already recorded there.`}
        </p>
      ) : null}
    </form>
  )
}
