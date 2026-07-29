import { describe, expect, it, vi } from 'vitest'
import type { ContextPack } from '@third-code-erp/database'
import {
  cortexEvidenceEvent,
  cortexEntityResponse,
  cortexRelationshipLabel,
} from './entity-response'

const NODE_ID = '11111111-1111-4111-8111-111111111111'
const NEIGHBOR_ID = '22222222-2222-4222-8222-222222222222'
const EDGE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '55555555-5555-4555-8555-555555555555'

function contextPack(overrides: Partial<ContextPack> = {}): ContextPack {
  const node = {
    id: NODE_ID,
    tenant_id: TENANT_ID,
    node_type: 'invoice',
    ref_table: 'invoices',
    ref_id: REF_ID,
    title: 'INV-100',
    summary: null,
    attributes: {},
    valid_from: new Date(),
    valid_to: null,
    recorded_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  }
  const neighborNode = {
    ...node,
    id: NEIGHBOR_ID,
    node_type: 'account',
    ref_table: 'accounts',
    title: 'Northstar Builders',
  }

  return {
    node,
    neighbors: [
      {
        edgeId: EDGE_ID,
        edgeType: 'bills',
        direction: 'in',
        origin: 'canonical',
        confidence: 1,
        node: neighborNode,
      },
    ],
    provenance: [],
    citations: [
      {
        nodeId: NODE_ID,
        nodeType: 'invoice',
        refTable: 'invoices',
        refId: REF_ID,
        title: 'INV-100',
        projectId: null,
      },
      {
        nodeId: NEIGHBOR_ID,
        nodeType: 'account',
        refTable: 'accounts',
        refId: REF_ID,
        title: 'Northstar Builders',
        projectId: null,
      },
    ],
    ...overrides,
  } as ContextPack
}

function provenance(
  origin: 'mutation' | 'document' | 'ai_run' | 'import' = 'mutation',
  createdAt = new Date('2026-07-27T18:39:13.258Z')
): ContextPack['provenance'][number] {
  return {
    id: 42,
    tenant_id: TENANT_ID,
    subject_kind: 'node',
    subject_id: NODE_ID,
    origin,
    origin_ref: 'internal:do-not-expose',
    actor_id: '66666666-6666-4666-8666-666666666666',
    prev_hash: 'a'.repeat(64),
    hash: 'b'.repeat(64),
    created_at: createdAt,
  }
}

describe('Cortex entity response', () => {
  it('maps relationship direction to human meaning', () => {
    expect(cortexRelationshipLabel('bills', 'out')).toBe('Bills')
    expect(cortexRelationshipLabel('bills', 'in')).toBe('Billed by')
    expect(cortexRelationshipLabel('unknown_edge', 'out')).toBe('Connected')
  })

  it('joins only already-filtered neighbor citations', () => {
    const describe = vi.fn(() => 'Invoice context')
    const answer = cortexEntityResponse(contextPack(), describe)

    expect(answer).toMatchObject({
      found: true,
      summary: 'Invoice context',
      relationships: [
        {
          edgeId: EDGE_ID,
          edgeType: 'bills',
          direction: 'in',
          label: 'Billed by',
          origin: 'canonical',
          confidence: 1,
          citation: {
            nodeId: NEIGHBOR_ID,
            title: 'Northstar Builders',
          },
        },
      ],
    })
    expect(describe).toHaveBeenCalledOnce()
  })

  it('omits a neighbor without an in-scope citation and bounds the response', () => {
    const pack = contextPack({
      citations: contextPack().citations.slice(0, 1),
    })
    expect(cortexEntityResponse(pack, () => '', 1).relationships).toEqual([])
  })

  it.each([
    ['mutation', 'record_change', 'ERP record change'],
    ['document', 'document', 'Document evidence'],
    ['ai_run', 'ai_analysis', 'AI analysis'],
    ['import', 'data_import', 'Data import'],
  ] as const)(
    'normalizes %s provenance to safe presentation',
    (origin, kind, label) => {
      expect(cortexEvidenceEvent(provenance(origin))).toEqual({
        kind,
        label,
        detail: expect.any(String),
        recordedAt: '2026-07-27T18:39:13.258Z',
      })
    }
  )

  it('does not expose provenance internals and bounds evidence', () => {
    const pack = contextPack({
      provenance: Array.from({ length: 8 }, (_, index) =>
        provenance(
          'mutation',
          new Date(`2026-07-${String(27 - index).padStart(2, '0')}T18:39:13.258Z`)
        )
      ),
    })
    const evidence = cortexEntityResponse(pack, () => '', 12, 6).evidence
    const serialized = JSON.stringify(evidence)

    expect(evidence).toHaveLength(6)
    expect(serialized).not.toContain('actor_id')
    expect(serialized).not.toContain('origin_ref')
    expect(serialized).not.toContain('prev_hash')
    expect(serialized).not.toContain('"hash"')
    expect(serialized).not.toContain('"id"')
    expect(serialized).not.toContain(TENANT_ID)
  })

  it('fails unknown provenance safely and omits malformed timestamps', () => {
    expect(
      cortexEvidenceEvent({
        ...provenance(),
        origin: 'future_origin',
      } as unknown as ContextPack['provenance'][number])
    ).toMatchObject({
      kind: 'system',
      label: 'System evidence',
    })
    expect(
      cortexEvidenceEvent({
        ...provenance(),
        created_at: 'not-a-date',
      } as unknown as ContextPack['provenance'][number])
    ).toBeNull()
  })

  it('keeps the compatible empty response with an empty relationship list', () => {
    expect(cortexEntityResponse(null, () => 'never')).toEqual({
      found: false,
      summary: '',
      citations: [],
      relationships: [],
      evidence: [],
    })
  })
})
