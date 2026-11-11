import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Reducer = (previous: unknown, formData: FormData) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  edit: vi.fn(),
  record: vi.fn(),
  reducer: null as Reducer | null,
  state: null as unknown,
  pending: false,
}))

vi.mock('../actions', () => ({ editCatalogueItem: mocks.edit, recordCataloguePrice: mocks.record }))
// A server render never leaves the first state, so the test stands in for
// useActionState: it keeps the form's own reducer and hands back a chosen state.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useActionState: (reducer: Reducer) => {
    mocks.reducer = reducer
    return [mocks.state, () => undefined, mocks.pending]
  },
}))

import { EditItemForm } from './edit-item-form'
import { RecordPriceForm } from './record-price-form'

const ITEM = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Portland cement, 40 kg bag',
  specification: 'Type 1, ASTM C150',
  unit: 'bag',
  trade: 'concrete',
  is_active: true,
}
const TRADES = [
  { slug: 'concrete', label: 'Concrete' },
  { slug: 'masonry', label: 'Masonry' },
]

function form(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

/** Submits through the form's own reducer, then renders the state it returned. */
async function submitted(element: React.ReactElement, formData: FormData): Promise<string> {
  renderToStaticMarkup(element)
  mocks.state = await mocks.reducer!(null, formData)
  return renderToStaticMarkup(element)
}

describe('catalogue admin forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.reducer = null
    mocks.state = null
    mocks.pending = false
  })

  describe('record price', () => {
    const element = <RecordPriceForm itemId={ITEM.id} today="2026-11-11" />

    it('takes pesos, a region that defaults to NCR and a date no later than today', () => {
      const html = renderToStaticMarkup(element)

      expect(html).toContain('<form class="finance-setup-form"')
      for (const name of ['price_php', 'price_low_php', 'price_avg_php', 'price_high_php']) {
        expect(html).toContain(
          `<input id="price-${name}" type="number" min="0" max="99999999999.99" step="0.01" aria-describedby="price-hint" name="${name}" value=""/>`,
        )
      }
      expect(html).not.toMatch(/centavo/i)
      expect(html).toContain(
        '<input id="price-region" maxLength="40" required="" name="region" value="NCR"/>',
      )
      expect(html).toContain(
        '<input id="price-checked" type="date" max="2026-11-11" required="" name="checked_on" value="2026-11-11"/>',
      )
      expect(html).toContain(
        '<button type="submit" class="finance-primary-button">Record price</button>',
      )
      expect(html).not.toContain('role="alert"')
      expect(html).not.toContain('role="status"')
    })

    it('shows the error the action returned and keeps what was typed', async () => {
      mocks.record.mockResolvedValue({
        ok: false,
        status: 400,
        error: 'Low price must not be above the average price.',
      })
      const sent = form({ price_low_php: '120.50', price_avg_php: '100', region: 'Cebu' })

      const html = await submitted(element, sent)

      expect(mocks.record).toHaveBeenCalledWith(sent)
      expect(html).toContain(
        '<p role="alert" class="finance-form-error">Low price must not be above the average price.</p>',
      )
      expect(html).not.toContain('role="status"')
      expect(html).toMatch(/name="price_low_php"[^>]*value="120.50"/)
      expect(html).toMatch(/name="region"[^>]*value="Cebu"/)
    })

    it('confirms a recorded price and clears the form for the next one', async () => {
      mocks.record.mockResolvedValue({ ok: true, data: { id: 'price-1' } })

      const html = await submitted(element, form({ price_php: '250', region: 'Cebu' }))

      expect(html).toContain('<p role="status" class="finance-form-hint">Price recorded.</p>')
      expect(html).not.toContain('role="alert"')
      expect(html).toMatch(/name="price_php"[^>]*value=""/)
      expect(html).toMatch(/name="region"[^>]*value="NCR"/)
    })

    it('disables the button while the price is being recorded', () => {
      mocks.pending = true

      expect(renderToStaticMarkup(element)).toContain(
        '<button type="submit" class="finance-primary-button" disabled="">Recording…</button>',
      )
    })
  })

  describe('edit item', () => {
    const element = <EditItemForm item={ITEM} trades={TRADES} />

    it('starts from the saved item with the catalogue limits on its fields', () => {
      const html = renderToStaticMarkup(element)

      expect(html).toContain('<form class="finance-setup-form"')
      expect(html).toContain(
        '<input id="item-name" maxLength="300" required="" name="name" value="Portland cement, 40 kg bag"/>',
      )
      expect(html).toContain('<input id="item-unit" maxLength="20" required="" name="unit" value="bag"/>')
      expect(html).toContain('<option value="concrete" selected="">Concrete</option>')
      expect(html).toContain('<option value="true" selected="">Active</option>')
      expect(html).toContain('maxLength="2000" rows="3">Type 1, ASTM C150</textarea>')
      expect(html).toContain('<button type="submit" class="finance-primary-button">Save item</button>')
      expect(html).not.toContain('role="alert"')
    })

    it('shows the error the action returned and keeps what was typed', async () => {
      mocks.edit.mockResolvedValue({ ok: false, status: 400, error: 'Enter a name.' })
      const sent = form({ id: ITEM.id, name: '', unit: 'sack', trade: 'masonry', is_active: 'false' })

      const html = await submitted(element, sent)

      expect(mocks.edit).toHaveBeenCalledWith(sent)
      expect(html).toContain('<p role="alert" class="finance-form-error">Enter a name.</p>')
      expect(html).not.toContain('role="status"')
      expect(html).toMatch(/name="unit"[^>]*value="sack"/)
      expect(html).toContain('<option value="masonry" selected="">Masonry</option>')
      expect(html).toContain('<option value="false" selected="">Inactive</option>')
    })

    it('confirms a saved item', async () => {
      mocks.edit.mockResolvedValue({ ok: true, data: { id: ITEM.id } })

      const html = await submitted(element, form({ id: ITEM.id, name: 'Cement' }))

      expect(html).toContain('<p role="status" class="finance-form-hint">Item saved.</p>')
      expect(html).not.toContain('role="alert"')
    })

    it('disables the button while saving', () => {
      mocks.pending = true

      expect(renderToStaticMarkup(element)).toContain(
        '<button type="submit" class="finance-primary-button" disabled="">Saving…</button>',
      )
    })
  })
})
