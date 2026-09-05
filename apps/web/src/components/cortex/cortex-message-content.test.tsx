import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CortexMessageContent } from './cortex-message-content'

describe('Cortex answer presentation', () => {
  it('separates evidence lists from prose without dropping content', () => {
    const html = renderToStaticMarkup(<CortexMessageContent content={'Available evidence:\n\n• Drawing A\n• Drawing B\n\nReview the sources.'} />)
    expect(html).toContain('<p>Available evidence:</p>')
    expect(html).toContain('<ul><li>Drawing A</li><li>Drawing B</li></ul>')
    expect(html).toContain('<p>Review the sources.</p>')
  })
  it('escapes HTML and never promotes untrusted text into links', () => {
    const html = renderToStaticMarkup(<CortexMessageContent content={'<script>alert(1)</script>\n\n[Open](javascript:alert(1))'} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a')
  })
  it('preserves incomplete streamed text', () => {
    expect(renderToStaticMarkup(<CortexMessageContent content="Finding the source…" />)).toContain('Finding the source…')
  })
})
