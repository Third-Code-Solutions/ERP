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
    refTable: 'invoices' as const,
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

  it('bounds a compact list and preserves a route to the full connection set', () => {
    const markup = renderToStaticMarkup(
      <CortexRelationshipList
        relationships={[
          relationship,
          {
            ...relationship,
            edgeId: '44444444-4444-4444-8444-444444444444',
            citation: {
              ...relationship.citation,
              refId: '55555555-5555-4555-8555-555555555555',
              title: 'INV-200',
            },
          },
        ]}
        limit={1}
        moreHref="/cortex?refTable=projects&refId=project-1"
      />
    )

    expect(markup).toContain('INV-100')
    expect(markup).not.toContain('INV-200')
    expect(markup).toContain('View all 2 connections')
    expect(markup).toContain('aria-label="View all 2 connections in Cortex"')
    expect(markup).toContain('href="/cortex?refTable=projects&amp;refId=project-1"')
  })

  it('renders nothing for an empty relationship list', () => {
    expect(
      renderToStaticMarkup(
        <CortexRelationshipList relationships={[]} />
      )
    ).toBe('')
  })
})
