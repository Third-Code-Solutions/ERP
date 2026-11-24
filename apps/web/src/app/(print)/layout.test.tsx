import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintLayout, { metadata } from './layout'

describe('print route layout', () => {
  it('does not stamp the product name on printed document titles', () => {
    expect(metadata.title).toEqual({ default: 'Document', template: '%s' })
  })

  it('leaves the HTML document to the root layout', () => {
    const markup = renderToStaticMarkup(<PrintLayout><main>Printable record</main></PrintLayout>)
    expect(markup).not.toMatch(/<(html|head|body)(?:\s|>)/)
    expect(markup).toContain('Printable record')
    expect(markup).toContain('@media print')
    expect(markup).toContain('.no-print')
  })
})
