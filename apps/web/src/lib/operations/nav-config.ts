/**
 * Single source of truth for sidebar navigation + RBAC route-guards.
 *
 * One config drives:
 *   1. The sidebar items the user sees (visibleNavSections).
 *   2. The defense-in-depth path-level guard (canViewPath) used by the
 *      dashboard layout — so even if a user types a forbidden URL, the
 *      server-side check redirects them away.
 *
 * Role policy mirrors REFACTOR.md §2 — the canonical 9-role ABI OPS
 * matrix. Legacy values (owner / estimator / pm) are folded into their
 * canonical equivalent via canonicalRole() so we never duplicate them
 * in the per-item allow-lists.
 */
import type { AppRole } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types'

export interface NavItemDef {
  href: string
  label: string
  iconKey: NavIconKey
  /**
   * Keep the route in the authorization map while omitting it from ordinary
   * sidebar navigation. Used only for controlled-rollout routes that retain a
   * protected deep-link/canary path.
   */
  visible?: boolean
  /**
   * Roles that can VIEW this item in the sidebar AND access the
   * route via direct URL. If undefined, everyone (including viewers)
   * gets access. Always uses canonical role names.
   */
  roles?: AppRole[]
  /** Optional short hint shown under hover/title for accessibility. */
  description?: string
}

export type NavIconKey =
  | 'Dashboard'
  | 'Projects'
  | 'Pipeline'
  | 'Bom'
  | 'Building'
  | 'User'
  | 'Invoice'
  | 'PurchaseOrder'
  | 'Documents'
  | 'Reports'
  | 'Layers'
  | 'Check'
  | 'Activity'
  | 'Settings'
  | 'Upload'
  | 'Receipt'
  | 'Cortex'

export interface NavSection {
  label: string
  items: NavItemDef[]
}

/**
 * Map legacy roles → their canonical equivalents. Lets us keep allow-
 * lists short and aligned to REFACTOR.md §2.
 */
const CANONICAL: Record<AppRole, AppRole> = {
  // Legacy → canonical
  owner: 'admin',
  estimator: 'commercial',
  pm: 'sd_pm_pe',
  // Canonical identity
  admin: 'admin',
  sales: 'sales',
  commercial: 'commercial',
  design: 'design',
  sd_pm_pe: 'sd_pm_pe',
  finance: 'finance',
  procurement: 'procurement',
  safety: 'safety',
  cx: 'cx',
  viewer: 'viewer',
}

const APP_ROLE_VALUES = new Set<string>(ERP_ROLES)

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLE_VALUES.has(value)
}

export function canonicalRole(role: AppRole): AppRole {
  return CANONICAL[role] ?? role
}

/** Human-readable role label for the sidebar chip. */
export function roleLabel(role: AppRole): string {
  const map: Record<AppRole, string> = {
    admin: 'Admin',
    owner: 'Owner',
    sales: 'Sales',
    commercial: 'Commercial',
    design: 'Design',
    sd_pm_pe: 'SD / PM / PE',
    finance: 'Finance',
    procurement: 'Procurement',
    safety: 'Safety',
    cx: 'Customer Experience',
    viewer: 'Viewer',
    estimator: 'Estimator',
    pm: 'PM',
  }
  return map[role] ?? role
}

// -----------------------------------------------------------------------------
// Role-aware nav config — REFACTOR.md §2 permissions matrix.
//
// Visibility rules (canonical roles only — legacy mapped via canonicalRole):
//
//   /dashboard           → everyone
//   /crm/accounts        → everyone (read); only permitted roles receive
//                          create/mutation controls
//   /crm/kyc-queue       → admin, finance
//   /pipeline/board      → everyone (read); stage commands remain capability-gated
//   /projects            → everyone (project.read); creation/update/delete
//                          commands remain capability-gated
//   /bom                 → admin, commercial, viewer (read only)
//   /tasks               → everyone (My-Tasks is assignee-scoped server-side)
//   /permits             → admin, commercial, sd_pm_pe, safety, viewer (read only)
//   /procurement/rfqs    → admin, procurement, commercial, viewer (read only)
//   /procurement/deliveries → admin, procurement, sd_pm_pe, viewer (read only)
//   /purchase-orders     → admin, commercial, sd_pm_pe, procurement, viewer (read only)
//   /invoices            → admin, finance
//   /claims              → admin, finance, sd_pm_pe, commercial
//   /punchlist           → admin, sd_pm_pe, cx, safety, viewer (read only)
//   /warranty            → admin, cx, viewer (read only)
//   /warranty/cnps       → admin, cx, viewer (read only)
//   /documents           → everyone (per-doc RLS scoping in DB)
//   /reports             → admin, sales, finance
//   /admin/*             → admin, commercial (rate-card administration)
//   /settings            → everyone (account-level settings)
// -----------------------------------------------------------------------------

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', iconKey: 'Dashboard' },
      {
        href: '/cortex',
        label: 'Cortex',
        iconKey: 'Cortex',
        description: 'AI Brain — knowledge graph + agent',
      },
      {
        href: '/crm/accounts',
        label: 'Accounts',
        iconKey: 'Building',
      },
      {
        href: '/crm/kyc-queue',
        label: 'KYC Queue',
        iconKey: 'User',
        roles: ['admin', 'finance'],
      },
      {
        href: '/pipeline/board',
        label: 'Pipeline',
        iconKey: 'Pipeline',
      },
      {
        href: '/projects',
        label: 'Projects',
        iconKey: 'Projects',
      },
      {
        href: '/bom',
        label: 'BOM Builder',
        iconKey: 'Bom',
        roles: ['admin', 'commercial', 'viewer'],
      },
      { href: '/tasks', label: 'My Tasks', iconKey: 'Check' },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/process',
        label: 'Process Health',
        iconKey: 'Activity',
        description: 'BU-level SLA, breach, and escalation health',
      },
      {
        href: '/permits',
        label: 'Permits',
        iconKey: 'Layers',
        roles: ['admin', 'commercial', 'sd_pm_pe', 'safety', 'viewer'],
      },
      {
        href: '/procurement/rfqs',
        label: 'RFQs',
        iconKey: 'PurchaseOrder',
        roles: ['admin', 'procurement', 'commercial', 'viewer'],
      },
      {
        href: '/procurement/deliveries',
        label: 'Deliveries',
        iconKey: 'Upload',
        roles: ['admin', 'procurement', 'sd_pm_pe', 'viewer'],
      },
      {
        href: '/purchase-orders',
        label: 'Purchase Orders',
        iconKey: 'PurchaseOrder',
        roles: ['admin', 'commercial', 'sd_pm_pe', 'procurement', 'viewer'],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        iconKey: 'Layers',
        roles: ['admin', 'finance', 'procurement', 'sd_pm_pe', 'commercial', 'viewer'],
        description: 'Warehouses, receipts, and perpetual stock',
      },
      {
        href: '/assets',
        label: 'Assets',
        iconKey: 'Layers',
        visible: false,
        roles: [
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
        ],
        description: 'Equipment, vehicles, tools, and custody',
      },
      {
        href: '/invoices',
        label: 'Invoices',
        iconKey: 'Invoice',
        roles: ['admin', 'finance'],
      },
      {
        href: '/claims',
        label: 'Claims',
        iconKey: 'Receipt',
        roles: ['admin', 'finance', 'sd_pm_pe', 'commercial'],
      },
      {
        href: '/punchlist',
        label: 'Punchlist',
        iconKey: 'Check',
        roles: ['admin', 'sd_pm_pe', 'cx', 'safety', 'viewer'],
      },
      {
        href: '/warranty',
        label: 'Warranty',
        iconKey: 'Activity',
        roles: ['admin', 'cx', 'viewer'],
      },
      {
        href: '/warranty/cnps',
        label: 'CNPS',
        iconKey: 'Activity',
        roles: ['admin', 'cx', 'viewer'],
      },
      { href: '/documents', label: 'Documents', iconKey: 'Documents' },
      {
        href: '/reports',
        label: 'Reports',
        iconKey: 'Reports',
        roles: ['admin', 'sales', 'finance'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        href: '/finance',
        label: 'Finance',
        iconKey: 'Receipt',
        roles: ['admin', 'finance'],
        description: 'Chart, journals, periods, and general ledger',
      },
      {
        href: '/finance/receivables',
        label: 'Receivables',
        iconKey: 'Invoice',
        roles: ['admin', 'finance'],
        description: 'Posted customer balances and aging',
      },
      {
        href: '/finance/payables',
        label: 'Payables',
        iconKey: 'Receipt',
        roles: ['admin', 'finance'],
        description: 'Matched supplier bills and aging',
      },
      {
        href: '/finance/cash',
        label: 'Cash',
        iconKey: 'Receipt',
        roles: ['admin', 'finance'],
        description: 'Allocated receipts and disbursements',
      },
      {
        href: '/finance/reconciliation',
        label: 'Reconciliation',
        iconKey: 'Check',
        roles: ['admin', 'finance'],
        description: 'Bank statement matching and immutable close',
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        href: '/admin',
        label: 'Admin',
        iconKey: 'Settings',
        // Commercial owns rate-card maintenance. The page and child routes
        // still capability-filter users/system configuration to admin/owner.
        roles: ['admin', 'commercial'],
      },
    ],
  },
]

/** Filter the nav config down to what the given role may see. */
export function visibleNavSections(role: AppRole): NavSection[] {
  const me = canonicalRole(role)
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.visible === false) return false
      if (!item.roles) return true
      return item.roles.includes(me)
    }),
  })).filter((section) => section.items.length > 0)
}

/**
 * Resolve the single most specific sidebar item for the current route.
 *
 * A simple `startsWith` check makes both `/finance` and
 * `/finance/receivables` look active on a child route. Choosing the longest
 * matching href keeps the parent route discoverable without presenting two
 * competing active states.
 */
export function activeNavHref(
  pathname: string,
  sections: readonly NavSection[]
): string | null {
  return (
    sections
      .flatMap((section) => section.items)
      .filter(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  )
}

/**
 * Defense-in-depth: returns false when the role isn't permitted to
 * load the given pathname under /(dashboard). Pages outside this nav
 * config (e.g. /portal/*, /api/*, /auth/*) return true so they're
 * unaffected.
 */
export function canViewPath(role: AppRole, pathname: string): boolean {
  // Always allow account/settings/help/etc.
  if (pathname === '/' || pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/api/') || pathname.startsWith('/portal/')) return true
  if (pathname.startsWith('/auth/')) return true

  const me = canonicalRole(role)

  // Walk the nav config from most specific to least so /admin/users
  // matches /admin before /tasks.
  const allItems = NAV_SECTIONS.flatMap((s) => s.items).sort(
    (a, b) => b.href.length - a.href.length
  )
  for (const item of allItems) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (!item.roles) return true
      return item.roles.includes(me)
    }
  }

  // Catch-all: top-level dashboard ancillaries (e.g., /projects/[id]/...
  // child routes inherit from /projects); we already matched above via
  // startsWith. Anything truly unknown defaults to allow + the page's
  // own gate handles it.
  return true
}
