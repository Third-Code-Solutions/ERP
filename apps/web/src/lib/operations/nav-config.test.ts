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
    expect(canonicalRole('estimator')).toBe('commercial')
    expect(canonicalRole('pm')).toBe('sd_pm_pe')
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

  it('viewer sees only unrestricted items, never Admin', () => {
    const sections = visibleNavSections('viewer')
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href))
    // Unrestricted items are visible to everyone.
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/tasks')
    expect(hrefs).toContain('/documents')
    // Restricted items are hidden.
    expect(hrefs).not.toContain('/admin')
    expect(hrefs).not.toContain('/invoices')
    expect(hrefs).not.toContain('/finance')
    expect(hrefs).not.toContain('/finance/payables')
    expect(hrefs).not.toContain('/bom')
    expect(hrefs).toContain('/assets')
  })

  it('legacy estimator inherits commercial visibility (BOM Builder)', () => {
    const hrefs = visibleNavSections('estimator')
      .flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs).toContain('/bom')
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
    expect(canViewPath('estimator', '/bom')).toBe(true) // estimator → commercial
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
