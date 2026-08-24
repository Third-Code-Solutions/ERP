import { describe, expect, it } from 'vitest'

import {
  projectRouteCapability,
  visibleProjectTabs,
} from './project-access'

describe('project route authorization', () => {
  it('maps sensitive project child routes to their explicit read capability', () => {
    expect(projectRouteCapability('/projects/project-id/billing')).toBe(
      'finance.read',
    )
    expect(projectRouteCapability('/projects/project-id/cost')).toBe(
      'budget.read',
    )
    expect(projectRouteCapability('/projects/project-id/audit')).toBe(
      'audit.read',
    )
    expect(projectRouteCapability('/projects/project-id/bom/togal')).toBe(
      'bom.read',
    )
    expect(projectRouteCapability('/projects/project-id/not-registered')).toBeNull()
  })

  it('does not render sensitive project tabs for a role lacking their capabilities', () => {
    const salesTabs = visibleProjectTabs('sales').map((tab) => tab.slug)

    expect(salesTabs).not.toContain('billing')
    expect(salesTabs).not.toContain('cost')
    expect(salesTabs).not.toContain('audit')
    expect(salesTabs).not.toContain('bom')
  })

  it('keeps only finance readers on billing and audit readers on audit', () => {
    const financeTabs = visibleProjectTabs('finance').map((tab) => tab.slug)
    const viewerTabs = visibleProjectTabs('viewer').map((tab) => tab.slug)

    expect(financeTabs).toContain('billing')
    expect(financeTabs).toContain('audit')
    expect(viewerTabs).not.toContain('billing')
    expect(viewerTabs).toContain('audit')
  })
})
