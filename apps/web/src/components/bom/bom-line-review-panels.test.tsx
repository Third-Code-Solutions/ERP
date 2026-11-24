import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/bom/actions', () => ({
  resolveTakeoffUnresolvedItem: vi.fn(),
}))

vi.mock('@/app/(dashboard)/bom/[bomId]/portal-actions', () => ({
  mintBomPortalToken: vi.fn(),
}))

import { BomLineEditRow } from './bom-line-edit-row'
import { BomSendToClientPanel } from './bom-send-to-client-panel'
import { BomTakeoffReviewQueue } from './bom-takeoff-review-queue'
import type { BomLineRowItem } from './bom-line-row'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const LINE: BomLineRowItem = {
  id: 'line-1',
  code: 'C-01',
  description: 'Concrete slab',
  unit: 'sqm',
  quantity: '12.5000',
  unit_cost_cents: 125_050,
  unit_rate_source: 'manual',
  line_total_cents: 1_563_125,
  location_id: null,
  parent_line_item_id: null,
  kind: 'work_item',
  classification_status: 'classified',
  item_no: null,
}

describe('BomLineEditRow', () => {
  it('opens with the stored values, the quantity in its short form and the cost in pesos', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <BomLineEditRow item={LINE} onSave={vi.fn()} onCancel={vi.fn()} />
        </tbody>
      </table>,
    )

    expect(html).toContain('value="Concrete slab"')
    expect(html).toContain('value="12.5"')
    expect(html).toContain('value="1250.50"')
    expect(html).toContain('>Save<')
    expect(html).not.toContain('disabled=""')
  })

  it('does not let a DUPA-priced line be re-priced from the row', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <BomLineEditRow
            item={{
              ...LINE,
              unit_rate_source: 'dupa',
              dupa: { unit_rate_centavos: '99900' } as BomLineRowItem['dupa'],
            }}
            onSave={vi.fn()}
            onCancel={vi.fn()}
          />
        </tbody>
      </table>,
    )

    expect(html).toContain('value="999.00"')
    expect(html).toContain('Set by the DUPA. Edit the DUPA to change it.')
    expect(html).toContain('disabled=""')
  })
})

describe('BomSendToClientPanel', () => {
  it('prefills the account contact email and says what the client will do', () => {
    const html = renderToStaticMarkup(
      <BomSendToClientPanel bomId="bom-1" defaultEmail="contact@client.example" />,
    )

    expect(html).toContain('value="contact@client.example"')
    expect(html).toContain('Email signing link')
    expect(html).toContain('approves it online')
  })
})

describe('BomTakeoffReviewQueue', () => {
  it('renders nothing when no imported row needs attention', () => {
    expect(
      renderToStaticMarkup(
        <BomTakeoffReviewQueue projectId={PROJECT_ID} rows={[]} divisions={[]} />,
      ),
    ).toBe('')
  })

  it('lists each row with its reasons and editable fields, and leaves a placeholder description blank', () => {
    const html = renderToStaticMarkup(
      <BomTakeoffReviewQueue
        projectId={PROJECT_ID}
        divisions={['Electrical']}
        rows={[
          {
            itemId: 'item-1',
            lineItemId: 'line-1',
            sourceRowKey: 'A-001',
            description: 'Unresolved takeoff row A-001',
            unit: 'bundle',
            quantity: '0.0000',
            division: null,
            reasons: [
              { code: 'EMPTY_DESCRIPTION', message: 'Description is required.' },
              { code: 'INVALID_UOM', message: 'UOM "bundle" is not recognized.' },
            ],
          },
        ]}
      />,
    )

    expect(html).toContain('Resolve imported rows')
    expect(html).toContain('1 imported row needs attention')
    expect(html).toContain('Description is required.')
    expect(html).toContain('UOM &quot;bundle&quot; is not recognized.')
    expect(html).toContain('aria-label="Description for imported row A-001"')
    expect(html).toContain('value=""')
    expect(html).toContain('value="bundle"')
    expect(html).toContain('<option value="Electrical"')
    expect(html).toContain('Save and resolve')
  })
})
