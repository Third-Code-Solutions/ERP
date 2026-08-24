import { describe, it, expect } from 'vitest'
import {
  canViewPath,
  visibleNavSections,
  canonicalRole,
  isAppRole,
  roleLabel,
  activeNavHref,
} from './nav-config'

describe('RBAC: canonicalRole', () => {
  it('folds legacy roles into canonical equivalents', () => {
    expect(canonicalRole('owner')).toBe('admin')
    expect(canonicalRole('pm')).toBe('sd_pm_pe')
  })

  it('keeps estimator distinct from commercial so navigation cannot grant commercial-only routes', () => {
    expect(canonicalRole('estimator')).toBe('estimator')
  })

  it('leaves canonical roles unchanged', () => {
    for (const r of ['admin', 'sales', 'finance', 'procurement', 'viewer'] as const) {
      expect(canonicalRole(r)).toBe(r)
    }
  })
})

describe('RBAC: runtime role boundary', () => {
  it('accepts only known persisted application roles', () => {
    expect(isAppRole('commercial')).toBe(true)
    expect(isAppRole('owner')).toBe(true)
    expect(isAppRole('not-a-role')).toBe(false)
    expect(isAppRole(null)).toBe(false)
    expect(isAppRole({ role: 'admin' })).toBe(false)
  })
})

describe('RBAC: visibleNavSections', () => {
  it('admin sees every section', () => {
    const sections = visibleNavSections('admin')
    const labels = sections.map((s) => s.label)
    expect(labels).toContain('Workspace')
    expect(labels).toContain('Operations')
    expect(labels).toContain('Finance')
    expect(labels).toContain('Admin')
  })

  it('viewer sees permitted operational read workspaces without finance or tenant administration', () => {
    const sections = visibleNavSections('viewer')
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href))
    // Unrestricted items are visible to everyone.
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/crm/accounts')
    expect(hrefs).toContain('/pipeline/board')
    expect(hrefs).toContain('/projects')
    expect(hrefs).toContain('/tasks')
    expect(hrefs).toContain('/documents')
    // Read-only operational items remain visible; all mutation controls are
    // guarded independently by their server actions and capabilities.
    expect(hrefs).toContain('/bom')
    expect(hrefs).toContain('/permits')
    expect(hrefs).toContain('/procurement/rfqs')
    expect(hrefs).toContain('/purchase-orders')
    expect(hrefs).toContain('/inventory')
    expect(hrefs).toContain('/punchlist')
    expect(hrefs).toContain('/warranty')
    expect(hrefs).toContain('/warranty/cnps')
    // Finance, reports, tenant administration, and KYC remain deliberately
    // restricted because they expose financial, identity, or configuration
    // data rather than the Viewer operational projection.
    expect(hrefs).not.toContain('/invoices')
    expect(hrefs).not.toContain('/claims')
    expect(hrefs).not.toContain('/reports')
    expect(hrefs).not.toContain('/finance')
    expect(hrefs).not.toContain('/finance/payables')
    expect(hrefs).not.toContain('/finance/cash')
    expect(hrefs).not.toContain('/finance/reconciliation')
    expect(hrefs).not.toContain('/admin')
    expect(hrefs).not.toContain('/assets')
  })

  it('makes pipeline and projects visible to every project/opportunity reader', () => {
    const projectReaders = [
      'owner',
      'estimator',
      'pm',
      'admin',
      'sales',
      'commercial',
      'design',
      'sd_pm_pe',
      'finance',
      'procurement',
      'safety',
      'cx',
      'viewer',
    ] as const

    for (const role of projectReaders) {
      const hrefs = visibleNavSections(role)
        .flatMap((section) => section.items.map((item) => item.href))
      expect(hrefs, role).toContain('/pipeline/board')
      expect(hrefs, role).toContain('/projects')
      expect(canViewPath(role, '/projects/project-id'), role).toBe(true)
    }
  })

  it('hides controlled-rollout routes without changing their direct-route guard', () => {
    const hrefs = visibleNavSections('admin')
      .flatMap((section) => section.items.map((item) => item.href))

    expect(hrefs).not.toContain('/assets')
    expect(canViewPath('viewer', '/assets')).toBe(true)
    expect(canViewPath('viewer', '/finance/cash')).toBe(false)
    expect(canViewPath('viewer', '/finance/reconciliation')).toBe(false)
    expect(canViewPath('viewer', '/warranty/cnps')).toBe(true)
  })

  it('shows estimator only its explicitly granted BOM route, not commercial-only routes', () => {
    const hrefs = visibleNavSections('estimator')
      .flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs).toContain('/bom')
    expect(hrefs).not.toContain('/admin')
    expect(hrefs).not.toContain('/inventory')
    expect(hrefs).not.toContain('/permits')
  })

  it('drops empty sections entirely', () => {
    // viewer has no Admin items → no Admin section.
    const labels = visibleNavSections('viewer').map((s) => s.label)
    expect(labels).not.toContain('Admin')
  })
})

describe('RBAC: canViewPath (deny-by-default route guard)', () => {
  it('allows everyone on unrestricted + account routes', () => {
    expect(canViewPath('viewer', '/dashboard')).toBe(true)
    expect(canViewPath('viewer', '/tasks')).toBe(true)
    expect(canViewPath('viewer', '/settings')).toBe(true)
    expect(canViewPath('viewer', '/documents')).toBe(true)
  })

  it('denies restricted routes to unprivileged roles', () => {
    expect(canViewPath('viewer', '/admin')).toBe(false)
    expect(canViewPath('viewer', '/admin/users')).toBe(false)
    expect(canViewPath('sales', '/invoices')).toBe(false)
    expect(canViewPath('sales', '/admin')).toBe(false)
    expect(canViewPath('procurement', '/invoices')).toBe(false)
    expect(canViewPath('sales', '/finance')).toBe(false)
    expect(canViewPath('sales', '/finance/payables')).toBe(false)
    expect(canViewPath('sales', '/projects/project-id/billing')).toBe(false)
    expect(canViewPath('sales', '/projects/project-id/cost')).toBe(false)
    expect(canViewPath('sales', '/projects/project-id/audit')).toBe(false)
    expect(canViewPath('sales', '/projects/project-id/bom')).toBe(false)
    expect(canViewPath('viewer', '/projects/project-id/billing')).toBe(false)
    expect(canViewPath('viewer', '/procurement/deliveries/new')).toBe(false)
    expect(canViewPath('viewer', '/procurement')).toBe(false)
    expect(canViewPath('viewer', '/not-a-dashboard-route')).toBe(false)
    expect(canViewPath('viewer', '/projects/project-id/not-registered')).toBe(false)
  })

  it('allows restricted routes to permitted roles', () => {
    expect(canViewPath('admin', '/admin/users')).toBe(true)
    expect(canViewPath('finance', '/invoices')).toBe(true)
    expect(canViewPath('finance', '/finance/ledger')).toBe(true)
    expect(canViewPath('finance', '/finance/payables/new')).toBe(true)
    expect(canViewPath('finance', '/finance/cash/new')).toBe(true)
    expect(canViewPath('procurement', '/procurement/rfqs')).toBe(true)
    expect(canViewPath('commercial', '/bom')).toBe(true)
    expect(canViewPath('viewer', '/assets')).toBe(true)
    expect(canViewPath('finance', '/projects/project-id/billing')).toBe(true)
    expect(canViewPath('viewer', '/projects/project-id/cost')).toBe(true)
    expect(canViewPath('viewer', '/projects/project-id/audit')).toBe(true)
    expect(canViewPath('viewer', '/projects/project-id/bom')).toBe(true)
    expect(canViewPath('procurement', '/procurement/deliveries/new')).toBe(true)
    expect(canViewPath('procurement', '/procurement')).toBe(true)
  })

  it('child routes inherit their parent permission', () => {
    // /projects is allowed for procurement → nested project pages too.
    expect(canViewPath('procurement', '/projects/abc-123/scope')).toBe(true)
    // Commercial may enter the admin surface for rate-card maintenance, but
    // finance remains denied from nested admin pages.
    expect(canViewPath('commercial', '/admin')).toBe(true)
    expect(canViewPath('finance', '/admin/users/42')).toBe(false)
  })

  it('matches the most specific nav item (KYC vs Accounts)', () => {
    // /crm/kyc-queue is admin+finance only; sales has accounts but not kyc.
    expect(canViewPath('sales', '/crm/accounts')).toBe(true)
    expect(canViewPath('sales', '/crm/kyc-queue')).toBe(false)
    expect(canViewPath('finance', '/crm/kyc-queue')).toBe(true)
  })

  it('honors legacy role mapping in the guard', () => {
    expect(canViewPath('owner', '/admin')).toBe(true) // owner → admin
    expect(canViewPath('estimator', '/bom')).toBe(true) // explicit BOM grant
    expect(canViewPath('estimator', '/admin')).toBe(false)
    expect(canViewPath('pm', '/admin')).toBe(false) // pm → sd_pm_pe, not admin
  })
})

describe('RBAC: roleLabel', () => {
  it('returns a human label for every role', () => {
    expect(roleLabel('sd_pm_pe')).toBe('SD / PM / PE')
    expect(roleLabel('cx')).toBe('Customer Experience')
    expect(roleLabel('admin')).toBe('Admin')
  })
})

describe('sidebar active state', () => {
  it('marks only the most specific Finance destination active', () => {
    const sections = visibleNavSections('finance')

    expect(activeNavHref('/finance', sections)).toBe('/finance')
    expect(activeNavHref('/finance/receivables', sections)).toBe(
      '/finance/receivables'
    )
    expect(activeNavHref('/finance/payables/123', sections)).toBe(
      '/finance/payables'
    )
    expect(activeNavHref('/finance/reconciliation/new', sections)).toBe(
      '/finance/reconciliation'
    )
  })

  it('returns no active item for an unrelated route', () => {
    expect(activeNavHref('/settings/profile', visibleNavSections('finance'))).toBe(
      null
    )
  })
})
