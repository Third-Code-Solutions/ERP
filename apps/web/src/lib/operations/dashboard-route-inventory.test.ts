import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'
import { canViewPath, DASHBOARD_ROUTE_POLICIES } from './nav-config'

const DASHBOARD_ROOT = fileURLToPath(
  new URL('../../app/(dashboard)', import.meta.url)
)

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

const ALL_ROLES = PERSISTED_ROLES
const ADMIN_AND_COMMERCIAL = ['owner', 'admin', 'commercial', 'viewer'] as const
const ADMIN_READ = ['owner', 'admin', 'viewer'] as const
const ADMIN_ONLY = ['owner', 'admin'] as const
const ACCOUNT_CREATE = ['owner', 'admin', 'sales'] as const
const BOM_READ = ['owner', 'admin', 'estimator', 'commercial', 'viewer'] as const
const CLAIM_READ = [
  'owner',
  'admin',
  'finance',
  'estimator',
  'pm',
  'sd_pm_pe',
  'commercial',
  'viewer',
] as const
const CLAIM_CREATE = [
  'owner',
  'admin',
  'finance',
  'commercial',
  'sd_pm_pe',
  'pm',
] as const
const FINANCE = ['owner', 'admin', 'finance'] as const
const FINANCE_READ = ['owner', 'admin', 'finance', 'viewer'] as const
const INVENTORY_READ = [
  'owner',
  'admin',
  'finance',
  'procurement',
  'sd_pm_pe',
  'pm',
  'commercial',
  'viewer',
] as const
const INVENTORY_MANAGE = ['owner', 'admin', 'procurement'] as const
const PERMIT_READ = [
  'owner',
  'admin',
  'estimator',
  'pm',
  'commercial',
  'sd_pm_pe',
  'safety',
  'viewer',
] as const
const PROJECT_CREATE = [
  'owner',
  'admin',
  'sales',
  'commercial',
  'sd_pm_pe',
  'pm',
  'estimator',
] as const
const PROJECT_AUDIT = ['owner', 'admin', 'pm', 'finance', 'viewer'] as const
const PROJECT_BOM = ['owner', 'admin', 'estimator', 'commercial', 'viewer'] as const
const PROJECT_COST = [
  'owner',
  'admin',
  'finance',
  'commercial',
  'procurement',
  'sd_pm_pe',
  'pm',
  'estimator',
  'viewer',
] as const
const PROCUREMENT_ROOT = [
  'owner',
  'admin',
  'commercial',
  'sd_pm_pe',
  'pm',
  'procurement',
  'viewer',
] as const
const DELIVERY_READ = [
  'owner',
  'admin',
  'pm',
  'procurement',
  'sd_pm_pe',
  'viewer',
] as const
const RFQ_READ = [
  'owner',
  'admin',
  'estimator',
  'procurement',
  'commercial',
  'viewer',
] as const
const PURCHASE_ORDER_READ = [
  'owner',
  'admin',
  'estimator',
  'pm',
  'commercial',
  'sd_pm_pe',
  'procurement',
  'viewer',
] as const
const PUNCHLIST_READ = [
  'owner',
  'admin',
  'pm',
  'sd_pm_pe',
  'cx',
  'safety',
  'viewer',
] as const
const PUNCHLIST_MANAGE = ['owner', 'admin', 'pm', 'sd_pm_pe', 'cx'] as const
const WARRANTY_READ = ['owner', 'admin', 'cx', 'viewer'] as const

/**
 * Independent, per-template oracle derived from the direct page gate (when
 * present), otherwise the established route read projection. A family-level
 * fallback here would hide accidental over-grants on create/admin/detail pages.
 */
const EXPECTED_ROLES_BY_TEMPLATE: Readonly<
  Record<string, readonly AppRole[]>
> = {
  '/admin': ADMIN_AND_COMMERCIAL,
  '/admin/data-quality': ADMIN_READ,
  '/admin/mapping-config': ADMIN_READ,
  '/admin/material-items': ADMIN_AND_COMMERCIAL,
  '/admin/rate-cards': ADMIN_AND_COMMERCIAL,
  '/admin/users': ADMIN_READ,
  '/admin/users/[id]': ADMIN_READ,
  '/admin/users/new': ADMIN_ONLY,
  '/assets': ALL_ROLES,
  '/scope': ALL_ROLES,
  '/checklist': ALL_ROLES,
  '/progress': ALL_ROLES,
  '/turnover': ALL_ROLES,
  '/coc': ALL_ROLES,
  '/comments': ALL_ROLES,
  '/access': ADMIN_READ,
  '/audit': PROJECT_AUDIT,
  '/billing': FINANCE_READ,
  '/cost': PROJECT_COST,
  '/cost/budget': PROJECT_COST,
  '/assets/[assetId]': ALL_ROLES,
  '/bom': BOM_READ,
  '/claims': CLAIM_READ,
  '/claims/[id]': CLAIM_READ,
  '/claims/new': CLAIM_CREATE,
  '/cortex': ALL_ROLES,
  '/crm': ALL_ROLES,
  '/crm/accounts': ALL_ROLES,
  '/crm/accounts/[id]': ALL_ROLES,
  '/crm/accounts/new': ACCOUNT_CREATE,
  '/crm/kyc-queue': FINANCE_READ,
  '/crm/opportunities': ALL_ROLES,
  '/crm/opportunities/[id]': ALL_ROLES,
  '/crm/opportunities/[id]/proposal': ALL_ROLES,
  '/crm/opportunities/[id]/proposal/change-requests': ALL_ROLES,
  '/crm/opportunities/[id]/proposal/design': ALL_ROLES,
  '/crm/opportunities/[id]/proposal/inspection': ALL_ROLES,
  '/crm/opportunities/[id]/proposal/pprf': ALL_ROLES,
  '/crm/opportunities/[id]/proposal/tender': ALL_ROLES,
  '/crm/opportunities/new/pprf': ACCOUNT_CREATE,
  '/dashboard': ALL_ROLES,
  '/documents': ALL_ROLES,
  '/finance': FINANCE_READ,
  '/finance/cash': FINANCE_READ,
  '/finance/cash/[id]': FINANCE_READ,
  '/finance/cash/new': FINANCE,
  '/finance/journals': FINANCE_READ,
  '/finance/journals/[id]': FINANCE_READ,
  '/finance/journals/new': FINANCE,
  '/finance/ledger': FINANCE_READ,
  '/finance/payables': FINANCE_READ,
  '/finance/payables/[id]': FINANCE_READ,
  '/finance/payables/[id]/edit': FINANCE,
  '/finance/payables/new': FINANCE,
  '/finance/receivables': FINANCE_READ,
  '/finance/reconciliation': FINANCE_READ,
  '/finance/reconciliation/[id]': FINANCE_READ,
  '/finance/reconciliation/new': FINANCE,
  '/inventory': INVENTORY_READ,
  '/inventory/movements': INVENTORY_READ,
  '/inventory/movements/[id]': INVENTORY_READ,
  '/inventory/movements/new': INVENTORY_MANAGE,
  '/inventory/receipts': INVENTORY_READ,
  '/inventory/receipts/[id]': INVENTORY_READ,
  '/inventory/receipts/new': INVENTORY_MANAGE,
  '/invoices': FINANCE_READ,
  '/invoices/[id]': FINANCE_READ,
  '/permits': PERMIT_READ,
  '/pipeline': ALL_ROLES,
  '/pipeline/list': ALL_ROLES,
  '/pipeline/board': ALL_ROLES,
  '/pipeline/conversion': ALL_ROLES,
  '/pipeline/coverage': ALL_ROLES,
  '/process': ALL_ROLES,
  '/roadmap': ALL_ROLES,
  '/procurement': PROCUREMENT_ROOT,
  '/procurement/deliveries': DELIVERY_READ,
  '/procurement/deliveries/[id]': DELIVERY_READ,
  '/procurement/deliveries/new': ['owner', 'admin', 'pm', 'procurement', 'sd_pm_pe'],
  '/procurement/rfqs': RFQ_READ,
  '/procurement/rfqs/[id]': RFQ_READ,
  '/procurement/vendors/performance': [
    'owner',
    'admin',
    'commercial',
    'finance',
    'procurement',
    'sd_pm_pe',
    'pm',
  ],
  '/projects': ALL_ROLES,
  '/projects/[id]': ALL_ROLES,
  '/projects/[id]/access': ADMIN_READ,
  '/projects/[id]/audit': PROJECT_AUDIT,
  '/projects/[id]/billing': FINANCE_READ,
  '/projects/[id]/bom': PROJECT_BOM,
  '/projects/[id]/bom/togal': ['owner', 'admin', 'estimator', 'commercial'],
  '/projects/[id]/checklist': ALL_ROLES,
  '/projects/[id]/coc': ALL_ROLES,
  '/projects/[id]/comments': ALL_ROLES,
  '/projects/[id]/cost': PROJECT_COST,
  '/projects/[id]/cost/budget': PROJECT_COST,
  '/projects/[id]/diary': ALL_ROLES,
  '/projects/[id]/documents': ALL_ROLES,
  '/projects/[id]/permits': ALL_ROLES,
  '/projects/[id]/progress': ALL_ROLES,
  '/projects/[id]/quality': ALL_ROLES,
  '/projects/[id]/reports': ALL_ROLES,
  '/projects/[id]/rfis': ALL_ROLES,
  '/projects/[id]/schedule': ALL_ROLES,
  '/projects/[id]/scope': ALL_ROLES,
  '/projects/[id]/submittals': ALL_ROLES,
  '/projects/[id]/turnover': ALL_ROLES,
  '/projects/[id]/vos': ALL_ROLES,
  '/projects/[id]/vos/[voId]': ALL_ROLES,
  '/projects/new': PROJECT_CREATE,
  '/punchlist': PUNCHLIST_READ,
  '/punchlist/[id]': PUNCHLIST_READ,
  '/punchlist/new': PUNCHLIST_MANAGE,
  '/purchase-orders': PURCHASE_ORDER_READ,
  '/purchase-orders/[id]': PURCHASE_ORDER_READ,
  '/reports': ['owner', 'admin', 'sales', 'finance', 'viewer'],
  '/settings': ALL_ROLES,
  '/settings/profile': ALL_ROLES,
  '/settings/tax': FINANCE_READ,
  '/tasks': ALL_ROLES,
  '/warranty': WARRANTY_READ,
  '/warranty/[id]': WARRANTY_READ,
  '/warranty/cnps': WARRANTY_READ,
}

const PRINT_ROOT = fileURLToPath(new URL('../../app/(print)', import.meta.url))

/** Print pages sit outside the dashboard layout; each gates on the dashboard page it prints. */
const PRINT_COUNTERPARTS: Record<string, string> = {
  '/inspection/[id]': '/crm/opportunities/[id]/proposal/inspection',
  '/invoices/[id]/bir2307': '/invoices/[id]',
  '/invoices/[id]/print': '/invoices/[id]',
  '/purchase-orders/[id]/print': '/purchase-orders/[id]',
  '/weekly-report/[id]': '/projects/[id]/reports',
}

// Only reads of the request itself may run before the route gate, never a data load.
const PRE_GATE_AWAIT = /^await (?:requireUuidRouteParams\(|requireUserProfile\(|getUserProfile\(|params\b|searchParams\b)/

function readPage(root: string, routeTemplate: string): string {
  return readFileSync(join(root, ...routeTemplate.split('/').filter(Boolean), 'page.tsx'), 'utf8')
}

function wildcard(path: string): string {
  return path.replace(/\$\{\w+\}|\[[^\]]+\]/g, '*')
}

function gatedRoutes(source: string): string[] {
  return [...source.matchAll(/requireRouteAccess\(\s*profile\.role,\s*(['`])(.+?)\1\s*\)/g)]
    .map((match) => wildcard(match[2] ?? ''))
}

/** Awaits in the page component that run before its first route gate and are not request reads. */
function dataLoadsBeforeGate(source: string): string[] {
  const start = Math.max(0, source.indexOf('export default async function'))
  const gate = source.indexOf('requireRouteAccess(', start)
  return [...source.slice(start, gate < 0 ? undefined : gate).matchAll(/await\s+[\w.]+\(?/g)]
    .map((match) => match[0])
    .filter((expression) => !PRE_GATE_AWAIT.test(expression))
}

function pageRouteTemplates(directory: string, root = DASHBOARD_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return pageRouteTemplates(path, root)
    if (entry.name !== 'page.tsx') return []

    const routeDirectory = relative(root, dirname(path))
      .split(sep)
      .join('/')
    return [routeDirectory === '' ? '/' : `/${routeDirectory}`]
  })
}

function samplePath(routeTemplate: string): string {
  return routeTemplate.replace(/\[[^\]]+\]/g, 'sample-id')
}

describe('dashboard route authorization inventory', () => {
  it('assigns every real dashboard page an explicit 13-role outcome', () => {
    const routeTemplates = pageRouteTemplates(DASHBOARD_ROOT).sort()
    const registeredTemplates = DASHBOARD_ROUTE_POLICIES.map(
      (policy) => policy.template
    ).sort()

    expect(routeTemplates).toHaveLength(121)
    expect(new Set(registeredTemplates).size).toBe(registeredTemplates.length)
    expect(registeredTemplates).toEqual(routeTemplates)
    expect(Object.keys(EXPECTED_ROLES_BY_TEMPLATE).sort()).toEqual(
      routeTemplates
    )

    for (const routeTemplate of routeTemplates) {
      const pathname = samplePath(routeTemplate)
      const expectedRoles = EXPECTED_ROLES_BY_TEMPLATE[routeTemplate]

      expect(expectedRoles, `missing role oracle: ${routeTemplate}`).toBeDefined()
      if (!expectedRoles) continue

      for (const role of PERSISTED_ROLES) {
        expect(canViewPath(role, pathname), `${role}: ${routeTemplate}`).toBe(
          expectedRoles.includes(role)
        )
      }
    }
  })

  // The layout gate does not re-run on client navigation, so each restricted page repeats it.
  it('repeats the route check inside every role-restricted page, before any data load', () => {
    const missing: string[] = []
    const loadsFirst: string[] = []
    for (const routeTemplate of pageRouteTemplates(DASHBOARD_ROOT)) {
      const expectedRoles = EXPECTED_ROLES_BY_TEMPLATE[routeTemplate] ?? []
      if (expectedRoles.length === PERSISTED_ROLES.length) continue

      const source = readPage(DASHBOARD_ROOT, routeTemplate)
      // A project feature entry checks its own '/<feature>' rule in the shared component.
      const entryFeature = /<ProjectFeatureEntry\s+feature="([^"]+)"/.exec(source)?.[1]
      if (entryFeature !== undefined) {
        if (`/${entryFeature}` !== routeTemplate) missing.push(routeTemplate)
        continue
      }

      if (!gatedRoutes(source).includes(wildcard(routeTemplate))) missing.push(routeTemplate)
      const loads = dataLoadsBeforeGate(source)
      if (loads.length > 0) loadsFirst.push(`${routeTemplate}: ${loads.join(', ')}`)
    }
    expect(missing).toEqual([])
    expect(loadsFirst).toEqual([])
  })

  it('has the project feature entry check the route of the page that renders it', () => {
    const source = readFileSync(join(DASHBOARD_ROOT, '_project-entry.tsx'), 'utf8')
    const body = source.slice(source.indexOf('export async function ProjectFeatureEntry'))

    expect(body).toContain('canViewPath(profile.role, `/${feature}`)')
    // The check comes before the entry reads the query or loads projects.
    expect(body.indexOf('canViewPath(')).toBeLessThan(body.indexOf('await searchParams'))
    expect(body.indexOf('canViewPath(')).toBeLessThan(body.indexOf('getProjectsThroughCoreApi('))
  })

  it('gates every print page on the dashboard page it prints, before any data load', () => {
    expect(pageRouteTemplates(PRINT_ROOT, PRINT_ROOT).sort()).toEqual(
      Object.keys(PRINT_COUNTERPARTS).sort()
    )
    const registered = new Set(DASHBOARD_ROUTE_POLICIES.map((policy) => policy.template))
    for (const [printTemplate, counterpart] of Object.entries(PRINT_COUNTERPARTS)) {
      const source = readPage(PRINT_ROOT, printTemplate)

      expect(registered.has(counterpart), counterpart).toBe(true)
      expect(gatedRoutes(source), printTemplate).toContain(wildcard(counterpart))
      expect(dataLoadsBeforeGate(source), printTemplate).toEqual([])
    }
  })

  it('does not let a dynamic or nested registration restore unknown fallback', () => {
    for (const role of PERSISTED_ROLES) {
      expect(canViewPath(role, '/unknown-dashboard/sample-id'), role).toBe(false)
    }
  })
})
