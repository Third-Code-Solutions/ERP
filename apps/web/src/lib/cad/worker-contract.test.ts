import { describe, expect, it } from 'vitest'

import { parseWorkerResponse } from './worker-contract'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000001'

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    document_id: DOCUMENT_ID,
    scope_items: [
      {
        code: 'HVAC-001',
        description: 'Fan Coil Unit',
        unit: 'unit',
        quantity: 2,
        unit_cost_cents: 125_000,
        notes: null,
      },
    ],
    count: 1,
    warnings: [],
    parsed_format: 'dxf',
    source_format: 'dwg',
    ...overrides,
  }
}

describe('CAD worker response contract', () => {
  it('accepts a bounded, document-matched response', () => {
    expect(parseWorkerResponse(validPayload(), DOCUMENT_ID)).toMatchObject({
      document_id: DOCUMENT_ID,
      count: 1,
      source_format: 'dwg',
    })
  })

  it('rejects a response for another document', () => {
    expect(() =>
      parseWorkerResponse(validPayload(), '00000000-0000-4000-8000-000000000002')
    ).toThrow('mismatched document')
  })

  it('rejects count mismatches instead of partially committing evidence', () => {
    expect(() => parseWorkerResponse(validPayload({ count: 0 }), DOCUMENT_ID)).toThrow(
      'count does not match'
    )
  })

  it('rejects negative quantities and unsafe cost values', () => {
    expect(() =>
      parseWorkerResponse(
        validPayload({
          scope_items: [
            {
              ...validPayload().scope_items[0],
              quantity: -1,
            },
          ],
        }),
        DOCUMENT_ID
      )
    ).toThrow()

    expect(() =>
      parseWorkerResponse(
        validPayload({
          scope_items: [
            {
              ...validPayload().scope_items[0],
              unit_cost_cents: 9_000_000_001,
            },
          ],
        }),
        DOCUMENT_ID
      )
    ).toThrow()
  })
})
