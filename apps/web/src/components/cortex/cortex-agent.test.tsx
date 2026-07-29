import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CortexAgent } from './cortex-agent'

describe('Cortex agent active-record presentation', () => {
  it('makes authorized record focus visible before the first message', () => {
    const markup = renderToStaticMarkup(
      <CortexAgent
        initialContext={{
          refTable: 'projects',
          refId: '11111111-1111-4111-8111-111111111111',
          nodeType: 'project',
          title: 'Harbour Tower',
        }}
      />
    )

    expect(markup).toContain('Focused on')
    expect(markup).toContain('Harbour Tower')
    expect(markup).toContain('Project')
    expect(markup).toContain('data-cortex-agent-context="projects"')
  })

  it('labels an unscoped chat as company-wide', () => {
    const markup = renderToStaticMarkup(<CortexAgent initialContext={null} />)

    expect(markup).toContain('Company-wide')
    expect(markup).not.toContain('data-cortex-agent-context=')
  })

  it('disables chat when a requested record cannot be authorized', () => {
    const markup = renderToStaticMarkup(
      <CortexAgent initialContext={null} contextUnavailable />
    )

    expect(markup).toContain('Record unavailable')
    expect(markup).toContain('Clear focus to continue')
    expect(markup).toMatch(/<textarea[^>]*disabled/)
  })
})
