import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/icons', () => ({
  IconAlert: () => null,
  IconClock: () => null,
  IconArrowDownRight: () => null,
  IconTrendingDown: () => null,
  IconCheck: () => null,
}))

import { AlertsPanel } from './alerts-panel'

const alerts = [
  {
    type: 'gp_erosion' as const,
    severity: 'danger' as const,
    label: 'Somnus',
    detail: 'Forecast margin is at risk',
    href: '/projects/project-1/bom',
  },
]

describe('AlertsPanel navigation', () => {
  it('routes Sales to the permitted project overview', () => {
    const markup = renderToStaticMarkup(<AlertsPanel alerts={alerts} role="sales" />)

    expect(markup).toContain('href="/projects/project-1"')
    expect(markup).not.toContain('href="/projects/project-1/bom"')
  })

  it('retains the authorized deep link for Owner', () => {
    const markup = renderToStaticMarkup(<AlertsPanel alerts={alerts} role="owner" />)

    expect(markup).toContain('href="/projects/project-1/bom"')
  })
})
