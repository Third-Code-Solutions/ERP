import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CortexIndexButton } from './cortex-index-button'

describe('CortexIndexButton', () => {
  it('renders a disabled, non-spending state while rollout gates are closed', () => {
    const markup = renderToStaticMarkup(<CortexIndexButton enabled={false} />)
    expect(markup).toContain('Semantic indexing paused')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain('Semantic indexing is not enabled for this workspace')
    expect(markup).toContain('no external indexing requests will be sent')
    expect(markup).toContain('aria-describedby="cortex-index-paused-reason"')
  })

  it('discloses the fixed batch and provider-call ceiling before approval', () => {
    const markup = renderToStaticMarkup(<CortexIndexButton enabled />)
    expect(markup).toContain('Index up to 64 records')
    expect(markup).toContain('role="alertdialog"')
    expect(markup).toContain('at most one external')
    expect(markup).toContain('Another batch always needs another approval')
    expect(markup).toContain('Approve 1 provider call')
    expect(markup).toContain('aria-live="polite"')
  })
})
