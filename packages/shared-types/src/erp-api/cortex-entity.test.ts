import { describe, expect, it } from 'vitest'
import {
  cortexEntityEvidenceEvent,
  cortexEntityParamsSchema,
  cortexEntityResponseFromSources,
} from './cortex-entity'

const NODE_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex entity contract', () => {
  it('accepts only registered references and no caller scope', () => {
    expect(
      cortexEntityParamsSchema.parse({
        refTable: 'journal_entries',
        refId: REF_ID,
      })
    ).toEqual({ refTable: 'journal_entries', refId: REF_ID })
    expect(() =>
      cortexEntityParamsSchema.parse({
        refTable: 'private_records',
        refId: REF_ID,
      })
    ).toThrow()
    expect(() =>
      cortexEntityParamsSchema.parse({
        refTable: 'journal_entries',
        refId: REF_ID,
        tenantId: REF_ID,
      })
    ).toThrow()
  })

  it('builds a bounded, citation-backed public response', () => {
    const response = cortexEntityResponseFromSources({
      summary: 'Journal context',
      citations: [
        {
          nodeId: NODE_ID,
          nodeType: 'journal_entry',
          refTable: 'journal_entries',
          refId: REF_ID,
          title: 'JE-1042',
          projectId: null,
        },
      ],
      relationships: [
        {
          edgeId: '33333333-3333-4333-8333-333333333333',
          edgeType: 'part_of',
          direction: 'out',
          origin: 'canonical',
          confidence: 1,
          nodeId: NODE_ID,
        },
        {
          edgeId: '44444444-4444-4444-8444-444444444444',
          edgeType: 'mentions',
          direction: 'out',
          origin: 'derived',
          confidence: 0.5,
          nodeId: '55555555-5555-4555-8555-555555555555',
        },
      ],
      evidence: [
        {
          origin: 'mutation',
          createdAt: new Date('2026-08-07T00:00:00.000Z'),
        },
      ],
    })

    expect(response).toMatchObject({
      found: true,
      relationships: [{ label: 'Part of' }],
      evidence: [{ kind: 'record_change' }],
    })
  })

  it('normalizes unknown evidence without exposing source internals', () => {
    expect(
      cortexEntityEvidenceEvent({
        origin: 'future_origin',
        createdAt: '2026-08-07T00:00:00.000Z',
      })
    ).toEqual({
      kind: 'system',
      label: 'System evidence',
      detail: 'Recorded by Cortex.',
      recordedAt: '2026-08-07T00:00:00.000Z',
    })
    expect(
      cortexEntityEvidenceEvent({
        origin: 'mutation',
        createdAt: 'not-a-date',
      })
    ).toBeNull()
  })
})
