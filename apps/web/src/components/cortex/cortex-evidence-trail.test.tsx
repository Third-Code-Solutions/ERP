import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CortexEvidenceTrail,
  formatCortexEvidenceTime,
} from './cortex-evidence-trail'

const evidence = {
  kind: 'record_change' as const,
  label: 'ERP record change',
  detail: 'Captured from an authorized ERP record change.',
  recordedAt: '2026-07-27T18:39:13.258Z',
}

describe('Cortex evidence trail', () => {
  it('renders a native disclosure with safe event meaning and time', () => {
    const markup = renderToStaticMarkup(
      <CortexEvidenceTrail evidence={[evidence]} />
    )

    expect(markup).toContain('<details')
    expect(markup).toContain('<summary')
    expect(markup).toContain('Evidence trail')
    expect(markup).toContain('1 event')
    expect(markup).toContain('ERP record change')
    expect(markup).toContain(
      'Captured from an authorized ERP record change.'
    )
    expect(markup).toContain(
      'dateTime="2026-07-27T18:39:13.258Z"'
    )
  })

  it('formats evidence timestamps in explicit UTC', () => {
    expect(formatCortexEvidenceTime(evidence.recordedAt)).toContain('UTC')
  })

  it('renders nothing without authorized evidence', () => {
    expect(
      renderToStaticMarkup(<CortexEvidenceTrail evidence={[]} />)
    ).toBe('')
  })
})
