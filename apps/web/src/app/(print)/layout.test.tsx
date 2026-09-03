import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintLayout from './layout'

describe('print route layout', () => {
  it('leaves the HTML document to the root layout', () => {
    const markup = renderToStaticMarkup(<PrintLayout><main>Printable record</main></PrintLayout>)
    expect(markup).not.toMatch(/<(html|head|body)(?:\s|>)/)
    expect(markup).toContain('Printable record')
    expect(markup).toContain('@media print')
    expect(markup).toContain('.no-print')
  })
})
