import { describe, it, expect } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'
import {
  canViewPath,
  visibleNavSections,
  canonicalRole,
  isAppRole,
  roleLabel,
  activeNavHref,
} from './nav-config'

const PERSISTED_ROLES = [
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
] as const satisfies readonly AppRole[]

const UNRESTRICTED_NAV_HREFS = [
  '/dashboard',
  '/cortex',
  '/crm/accounts',
  '/pipeline/board',
  '/projects',
  '/tasks',
  '/process',
  '/documents',
] as const

const RESTRICTED_NAV_HREFS_BY_ROLE = {
  owner: [
    '/crm/kyc-queue',
    '/bom',
    '/permits',
    '/procurement/rfqs',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
    '/invoices',
    '/claims',
    '/punchlist',
    '/warranty',
    '/warranty/cnps',
    '/reports',
    '/finance',
    '/finance/receivables',
    '/finance/payables',
    '/finance/cash',
    '/finance/reconciliation',
    '/admin',
  ],
  estimator: [
    '/bom',
    '/permits',
    '/procurement/rfqs',
    '/purchase-orders',
    '/claims',
  ],
  pm: [
    '/permits',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
    '/claims',
    '/punchlist',
  ],
  admin: [
    '/crm/kyc-queue',
    '/bom',
    '/permits',
    '/procurement/rfqs',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
    '/invoices',
    '/claims',
    '/punchlist',
    '/warranty',
    '/warranty/cnps',
    '/reports',
    '/finance',
    '/finance/receivables',
    '/finance/payables',
    '/finance/cash',
    '/finance/reconciliation',
    '/admin',
  ],
  sales: ['/reports'],
  commercial: [
    '/bom',
    '/permits',
    '/procurement/rfqs',
    '/purchase-orders',
    '/inventory',
    '/claims',
    '/admin',
  ],
  design: [],
  sd_pm_pe: [
    '/permits',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
    '/claims',
    '/punchlist',
  ],
  finance: [
    '/crm/kyc-queue',
    '/inventory',
    '/invoices',
    '/claims',
    '/reports',
    '/finance',
    '/finance/receivables',
    '/finance/payables',
    '/finance/cash',
    '/finance/reconciliation',
  ],
  procurement: [
    '/procurement/rfqs',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
  ],
  safety: ['/permits', '/punchlist'],
  cx: ['/punchlist', '/warranty', '/warranty/cnps'],
  viewer: [
    '/bom',
    '/permits',
    '/procurement/rfqs',
    '/procurement/deliveries',
    '/purchase-orders',
    '/inventory',
    '/punchlist',
    '/warranty',
    '/warranty/cnps',
  ],
} as const satisfies Record<AppRole, readonly string[]>

const VISIBLE_NAV_ORDER = [
  '/dashboard',
  '/cortex',
  '/crm/accounts',
  '/crm/kyc-queue',
  '/pipeline/board',
  '/projects',
  '/bom',
  '/tasks',
  '/process',
  '/permits',
  '/procurement/rfqs',
  '/procurement/deliveries',
  '/purchase-orders',
  '/inventory',
  '/invoices',
  '/claims',
  '/punchlist',
  '/warranty',
  '/warranty/cnps',
  '/documents',
  '/reports',
  '/finance',
  '/finance/receivables',
  '/finance/payables',
  '/finance/cash',
  '/finance/reconciliation',
  '/admin',
] as const

function visibleHrefs(role: AppRole): string[] {
  return visibleNavSections(role).flatMap((section) =>
    section.items.map((item) => item.href)
  )
}

function expectedVisibleHrefs(role: AppRole): string[] {
  const allowed = new Set<string>([
    ...UNRESTRICTED_NAV_HREFS,
    ...RESTRICTED_NAV_HREFS_BY_ROLE[role],
  ])
  return VISIBLE_NAV_ORDER.filter((href) => allowed.has(href))
}

describe('RBAC: canonicalRole', () => {
  it('preserves only the explicit owner-as-admin inheritance contract', () => {
    expect(canonicalRole('owner')).toBe('admin')
    for (const role of PERSISTED_ROLES.filter((value) => value !== 'owner')) {
      expect(canonicalRole(role), role).toBe(role)
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
  it.each(PERSISTED_ROLES)(
    'exposes the exact explicit route projection for %s',
    (role) => {
      expect(visibleHrefs(role)).toEqual(expectedVisibleHrefs(role))
    }
  )

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
    for (const role of PERSISTED_ROLES) {
      expect(visibleHrefs(role), role).not.toContain('/assets')
      expect(canViewPath(role, '/assets'), role).toBe(true)
      expect(canViewPath(role, '/assets/item-id'), role).toBe(true)
    }
    expect(canViewPath('viewer', '/finance/cash')).toBe(false)
    expect(canViewPath('viewer', '/finance/reconciliation')).toBe(false)
    expect(canViewPath('viewer', '/warranty/cnps')).toBe(true)
  })

  it('retains estimator read projections without commercial-only modules', () => {
    const hrefs = visibleHrefs('estimator')
    expect(hrefs).toContain('/bom')
    expect(hrefs).toContain('/procurement/rfqs')
    expect(hrefs).not.toContain('/inventory')
    expect(hrefs).not.toContain('/admin')
  })

  it('drops empty sections entirely', () => {
    // viewer has no Admin items → no Admin section.
    const labels = visibleNavSections('viewer').map((s) => s.label)
    expect(labels).not.toContain('Admin')
  })
})

describe('RBAC: canViewPath (deny-by-default route guard)', () => {
  it.each(PERSISTED_ROLES)(
    'matches the visible navigation policy for %s, including nested routes',
    (role) => {
      const visible = new Set(expectedVisibleHrefs(role))

      for (const href of VISIBLE_NAV_ORDER) {
        expect(canViewPath(role, href), `${role}: ${href}`).toBe(
          visible.has(href)
        )
        expect(
          canViewPath(role, `${href}/nested`),
          `${role}: ${href}/nested`
        ).toBe(visible.has(href))
      }
    }
  )

  it('allows everyone on unrestricted + account routes', () => {
    expect(canViewPath('viewer', '/dashboard')).toBe(true)
    expect(canViewPath('viewer', '/tasks')).toBe(true)
    expect(canViewPath('viewer', '/settings')).toBe(true)
    expect(canViewPath('viewer', '/settings/profile')).toBe(true)
    expect(canViewPath('viewer', '/documents')).toBe(true)
  })

  it('allows the exact profile settings route for every persisted role', () => {
    const roles = [
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

    for (const role of roles) {
      expect(canViewPath(role, '/settings/profile'), role).toBe(true)
    }
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

  it('denies the reproduced estimator alias false positives', () => {
    expect(canViewPath('estimator', '/admin')).toBe(false)
    expect(canViewPath('estimator', '/admin/rate-cards')).toBe(false)
    expect(canViewPath('estimator', '/inventory')).toBe(false)
    expect(canViewPath('estimator', '/inventory/receipts')).toBe(false)
    expect(canViewPath('commercial', '/admin')).toBe(true)
    expect(canViewPath('commercial', '/inventory')).toBe(true)
  })

  it('keeps owner inheritance and explicit pm route outcomes', () => {
    expect(canViewPath('owner', '/admin')).toBe(true) // owner → admin
    expect(canViewPath('pm', '/admin')).toBe(false)
    expect(canViewPath('pm', '/inventory')).toBe(true)
    expect(canViewPath('pm', '/procurement/deliveries')).toBe(true)
  })

  it('preserves the existing unknown-path fallback', () => {
    expect(canViewPath('viewer', '/future-workspace')).toBe(true)
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
