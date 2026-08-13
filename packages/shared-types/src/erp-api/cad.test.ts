import { describe, expect, it } from 'vitest'
import {
  cadScopeLineTotalCents,
  parseCadWorkerResponse,
} from './cad'

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

describe('CAD worker evidence contract', () => {
  it('accepts bounded, document-matched evidence', () => {
    expect(parseCadWorkerResponse(validPayload(), DOCUMENT_ID)).toMatchObject({
      document_id: DOCUMENT_ID,
      count: 1,
      source_format: 'dwg',
    })
  })

  it('rejects mismatched documents and count mismatches', () => {
    expect(() =>
      parseCadWorkerResponse(
        validPayload(),
        '00000000-0000-4000-8000-000000000002'
      )
    ).toThrow('mismatched document')
    expect(() =>
      parseCadWorkerResponse(validPayload({ count: 0 }), DOCUMENT_ID)
    ).toThrow('count does not match')
  })

  it('rejects negative quantities and unsafe cost values', () => {
    expect(() =>
      parseCadWorkerResponse(
        validPayload({
          scope_items: [
            { ...validPayload().scope_items[0], quantity: -1 },
          ],
        }),
        DOCUMENT_ID
      )
    ).toThrow()
    expect(() =>
      parseCadWorkerResponse(
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

  it('computes exact safe integer line totals', () => {
    expect(
      cadScopeLineTotalCents({
        code: null,
        description: 'Concrete',
        unit: 'sqm',
        quantity: 3,
        unit_cost_cents: 12_345,
        notes: null,
      })
    ).toBe(37_035)
    expect(() =>
      cadScopeLineTotalCents({
        code: null,
        description: 'Too large',
        unit: 'unit',
        quantity: 2_147_483_647,
        unit_cost_cents: 9_000_000_000,
        notes: null,
      })
    ).toThrow('outside supported range')
  })
})
