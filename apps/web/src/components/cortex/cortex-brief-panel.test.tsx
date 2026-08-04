import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CortexBriefView } from '@/lib/cortex/brief-presentation'
import { CortexBriefPanel } from './cortex-brief-panel'

const view: CortexBriefView = {
  generatedAt: '2026-08-04T00:00:00.000Z',
  stats: {
    nodes: 4,
    edges: 3,
    provenance: 4,
    byType: [{ nodeType: 'invoice', count: 4 }],
  },
  freshness: { fresh: 1, stale: 1, unknown: 0 },
  items: [
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
  ],
}

describe('CortexBriefPanel', () => {
  it('renders source-backed links, freshness, and scope copy', () => {
    const markup = renderToStaticMarkup(<CortexBriefPanel brief={view} />)

    expect(markup).toContain('What Cortex knows now')
    expect(markup).toContain('Recent source records, permission-scoped and ready to open.')
    expect(markup).toContain('href="/invoices/22222222-2222-4222-8222-222222222222"')
    expect(markup).toContain('Invoice 1042')
    expect(markup).toContain('Read-only evidence surface')
    expect(markup).toContain('Fresh')
  })

  it('renders the bounded empty state without a fake source link', () => {
    const markup = renderToStaticMarkup(
      <CortexBriefPanel brief={{ ...view, items: [] }} />
    )

    expect(markup).toContain('No indexed records in your current scope.')
    expect(markup).not.toContain('data-brief-item')
  })
})
