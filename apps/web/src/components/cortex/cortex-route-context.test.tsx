import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./cortex-entity-panel', async () => {
  const { createElement } = await import('react')
  return {
    CortexEntityPanel: ({
      refTable,
      refId,
    }: {
      refTable: string
      refId: string
    }) =>
      createElement('div', {
        'data-panel-ref-table': refTable,
        'data-panel-ref-id': refId,
      }),
  }
})

import { CortexRouteContext } from './cortex-route-context'

const RECORD_ID = '11111111-1111-4111-8111-111111111111'

describe('Cortex route context', () => {
  it('renders one loading context panel for a supported record', () => {
    const markup = renderToStaticMarkup(
      <CortexRouteContext pathname={`/invoices/${RECORD_ID}`} />
    )

    expect(markup).toContain('data-cortex-record-context="invoices"')
    expect(markup.match(/data-panel-ref-table="invoices"/g)).toHaveLength(1)
    expect(markup).toContain(`data-panel-ref-id="${RECORD_ID}"`)
  })

  it('renders nothing for an unsupported collection route', () => {
    expect(
      renderToStaticMarkup(<CortexRouteContext pathname="/invoices" />)
    ).toBe('')
  })

  it('does not duplicate the Project detail panel', () => {
    expect(
      renderToStaticMarkup(
        <CortexRouteContext pathname={`/projects/${RECORD_ID}`} />
      )
    ).toBe('')
  })
})
