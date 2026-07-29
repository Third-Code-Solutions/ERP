import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CortexRelationshipList } from './cortex-relationship-list'

const relationship = {
  edgeId: '11111111-1111-4111-8111-111111111111',
  edgeType: 'bills',
  direction: 'out' as const,
  label: 'Bills',
  origin: 'canonical',
  confidence: 1,
  citation: {
    nodeId: '22222222-2222-4222-8222-222222222222',
    nodeType: 'invoice',
    refTable: 'invoices',
    refId: '33333333-3333-4333-8333-333333333333',
    title: 'INV-100',
    projectId: null,
  },
}

describe('Cortex relationship list', () => {
  it('renders a meaningful canonical record link', () => {
    const markup = renderToStaticMarkup(
      <CortexRelationshipList relationships={[relationship]} />
    )

    expect(markup).toContain('aria-label="Connections"')
    expect(markup).toContain('Bills')
    expect(markup).toContain('Invoice')
    expect(markup).toContain('INV-100')
    expect(markup).toContain(
      'href="/invoices/33333333-3333-4333-8333-333333333333"'
    )
  })

  it('renders a non-navigable relationship as static content', () => {
    const markup = renderToStaticMarkup(
      <CortexRelationshipList
        relationships={[
          {
            ...relationship,
            citation: {
              ...relationship.citation,
              nodeType: 'unknown_type',
            },
          },
        ]}
      />
    )

    expect(markup).not.toContain('<a')
    expect(markup).toContain('cortex-relationship--static')
  })

  it('renders nothing for an empty relationship list', () => {
    expect(
      renderToStaticMarkup(
        <CortexRelationshipList relationships={[]} />
      )
    ).toBe('')
  })
})
