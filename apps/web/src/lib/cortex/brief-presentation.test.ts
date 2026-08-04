import { describe, expect, it } from 'vitest'
import type { CortexOperationalBrief } from '@third-code-erp/database'
import { presentCortexBrief } from './brief-presentation'

const brief = {
  generatedAt: new Date('2026-08-04T00:00:00.000Z'),
  stats: {
    nodes: 4,
    edges: 3,
    provenance: 4,
    byType: [{ nodeType: 'invoice', count: 4 }],
  },
  freshness: { fresh: 1, stale: 1, unknown: 0 },
  items: [
    {
      nodeId: '11111111-1111-4111-8111-111111111111',
      nodeType: 'invoice',
      refTable: 'invoices',
      refId: '22222222-2222-4222-8222-222222222222',
      title: '  Invoice 1042  ',
      summary: '  Concrete Tower progress billing  ',
      freshness: 'fresh',
      recordedAt: new Date('2026-08-03T23:00:00.000Z'),
      projectId: null,
    },
    {
      nodeId: '33333333-3333-4333-8333-333333333333',
      nodeType: 'invoice',
      refTable: 'secret_table',
      refId: '44444444-4444-4444-8444-444444444444',
      title: 'Should not leak',
      summary: null,
      freshness: 'stale',
      recordedAt: new Date('2026-08-03T22:00:00.000Z'),
      projectId: null,
    },
    {
      nodeId: '55555555-5555-4555-8555-555555555555',
      nodeType: 'future_type',
      refTable: 'future_records',
      refId: '66666666-6666-4666-8666-666666666666',
      title: 'Unknown source',
      summary: 'Not renderable',
      freshness: 'unknown',
      recordedAt: new Date('2026-08-03T21:00:00.000Z'),
      projectId: null,
    },
  ],
} as CortexOperationalBrief

describe('presentCortexBrief', () => {
  it('keeps only registered tenant-safe source records and normalizes copy', () => {
    const view = presentCortexBrief(brief)

    expect(view.generatedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(view.items).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        nodeType: 'invoice',
        label: 'Invoice',
        title: 'Invoice 1042',
        summary: 'Concrete Tower progress billing',
        href: '/invoices/22222222-2222-4222-8222-222222222222',
        refTable: 'invoices',
        refId: '22222222-2222-4222-8222-222222222222',
        freshness: 'fresh',
        recordedAt: '2026-08-03T23:00:00.000Z',
      },
    ])
  })

  it('uses the registry label for an empty title and honors the item bound', () => {
    const twoInvoices = {
      ...brief,
      items: [
        brief.items[0],
        {
          ...brief.items[0],
          nodeId: '77777777-7777-4777-8777-777777777777',
          title: ' ',
          summary: ' ',
        },
      ],
    } as CortexOperationalBrief

    const view = presentCortexBrief(twoInvoices, 1)
    expect(view.items).toHaveLength(1)
    expect(view.items[0]?.title).toBe('Invoice 1042')
    expect(view.items[0]?.summary).toBe('Concrete Tower progress billing')
  })

  it('supports an explicit zero bound without exposing records', () => {
    expect(presentCortexBrief(brief, 0).items).toEqual([])
  })
})
