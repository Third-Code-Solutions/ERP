/**
 * Co-located sidebar navigation and explicit dashboard route authorization.
 *
 * NAV_SECTIONS drives only the sidebar items the user sees. The complete
 * DASHBOARD_ROUTE_POLICIES registry separately drives the defense-in-depth
 * path guard, so hidden pages stay hidden and unregistered descendants fail
 * closed.
 *
 * Route policy is explicit for every persisted ABI OPS role. Owner inherits
 * the admin projection by contract; estimator and pm remain distinct because
 * the central capability registry grants them different authority from
 * commercial and sd_pm_pe respectively.
 */
import type { AppRole } from '@third-code-erp/auth'

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
   * gets access. Estimator and pm must be listed explicitly; owner inherits
   * admin through canonicalRole().
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

export interface DashboardRoutePolicy {
  template: string
  /** Undefined means every authenticated application role. */
  roles?: readonly AppRole[]
}

/**
 * Preserve the explicit owner-as-super-admin contract without erasing the
 * distinct authorization policy for any other persisted role.
 */
const CANONICAL: Record<AppRole, AppRole> = {
  // Contractually inherited super-admin projection.
  owner: 'admin',
  // Every other persisted role is an authorization identity in its own right.
  estimator: 'estimator',
  pm: 'pm',
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

const APP_ROLE_VALUES = new Set<string>([
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
])

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
// Visibility rules (all persisted roles are explicit except owner → admin):
//
//   /dashboard           → everyone
//   /crm/accounts        → everyone (read); only permitted roles receive
//                          create/mutation controls
//   /crm/kyc-queue       → admin, finance, viewer (read only)
//   /pipeline      → everyone (read); stage commands remain capability-gated
//   /projects            → everyone (project.read); creation/update/delete
//                          commands remain capability-gated
//   /bom                 → admin, estimator, commercial, viewer (read only)
//   /tasks               → everyone (My-Tasks is assignee-scoped server-side)
//   /permits             → admin, estimator, pm, commercial, sd_pm_pe, safety, viewer
//   /procurement/rfqs    → admin, estimator, procurement, commercial, viewer
//   /procurement/deliveries → admin, pm, procurement, sd_pm_pe, viewer
//   /purchase-orders     → admin, estimator, pm, commercial, sd_pm_pe,
//                          procurement, viewer
//   /inventory           → admin, pm, commercial, sd_pm_pe, finance,
//                          procurement, viewer
//   /invoices            → admin, finance, viewer (read only)
//   /claims              → admin, estimator, pm, commercial, sd_pm_pe, finance,
//                          viewer (read only)
//   /punchlist           → admin, pm, sd_pm_pe, cx, safety, viewer (read only)
//   /warranty            → admin, cx, viewer (read only)
//   /warranty/cnps       → admin, cx, viewer (read only)
//   /documents           → everyone (per-doc RLS scoping in DB)
//   /reports             → admin, sales, finance, viewer (read only)
//   /admin               → admin, commercial, viewer (read only)
//   /admin/users|config  → admin, viewer (page-local mutation gates)
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
        roles: ['admin', 'finance', 'viewer'],
      },
      {
        href: '/pipeline',
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
        roles: ['admin', 'estimator', 'commercial', 'viewer'],
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
        // Estimator/pm retain the existing entity read projection; narrower
        // permit mutations remain capability-gated by their server actions.
        roles: [
          'admin',
          'estimator',
          'pm',
          'commercial',
          'sd_pm_pe',
          'safety',
          'viewer',
        ],
      },
      {
        href: '/procurement/rfqs',
        label: 'RFQs',
        iconKey: 'PurchaseOrder',
        roles: ['admin', 'estimator', 'procurement', 'commercial', 'viewer'],
      },
      {
        href: '/procurement/deliveries',
        label: 'Deliveries',
        iconKey: 'Upload',
        roles: ['admin', 'pm', 'procurement', 'sd_pm_pe', 'viewer'],
      },
      {
        href: '/purchase-orders',
        label: 'Purchase Orders',
        iconKey: 'PurchaseOrder',
        roles: [
          'admin',
          'estimator',
          'pm',
          'commercial',
          'sd_pm_pe',
          'procurement',
          'viewer',
        ],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        iconKey: 'Layers',
        roles: [
          'admin',
          'finance',
          'procurement',
          'pm',
          'sd_pm_pe',
          'commercial',
          'viewer',
        ],
        description: 'Warehouses, receipts, and perpetual stock',
      },
      {
        href: '/assets',
        label: 'Assets',
        iconKey: 'Layers',
        visible: false,
        roles: [
          'admin',
          'estimator',
          'pm',
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
        roles: ['admin', 'finance', 'viewer'],
      },
      {
        href: '/claims',
        label: 'Claims',
        iconKey: 'Receipt',
        roles: [
          'admin',
          'finance',
          'estimator',
          'pm',
          'sd_pm_pe',
          'commercial',
          'viewer',
        ],
      },
      {
        href: '/punchlist',
        label: 'Punchlist',
        iconKey: 'Check',
        roles: ['admin', 'pm', 'sd_pm_pe', 'cx', 'safety', 'viewer'],
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
        roles: ['admin', 'sales', 'finance', 'viewer'],
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
        roles: ['admin', 'finance', 'viewer'],
        description: 'Chart, journals, periods, and general ledger',
      },
      {
        href: '/finance/receivables',
        label: 'Receivables',
        iconKey: 'Invoice',
        roles: ['admin', 'finance', 'viewer'],
        description: 'Posted customer balances and aging',
      },
      {
        href: '/finance/payables',
        label: 'Payables',
        iconKey: 'Receipt',
        roles: ['admin', 'finance', 'viewer'],
        description: 'Matched supplier bills and aging',
      },
      {
        href: '/finance/cash',
        label: 'Cash',
        iconKey: 'Receipt',
        roles: ['admin', 'finance', 'viewer'],
        description: 'Allocated receipts and disbursements',
      },
      {
        href: '/finance/reconciliation',
        label: 'Reconciliation',
        iconKey: 'Check',
        roles: ['admin', 'finance', 'viewer'],
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
        roles: ['admin', 'commercial', 'viewer'],
      },
    ],
  },
]

const ADMIN_ROUTE_ROLES = ['admin', 'commercial', 'viewer'] as const
const ADMIN_READ_ROUTE_ROLES = ['admin', 'viewer'] as const
const ADMIN_ONLY_ROUTE_ROLES = ['admin'] as const
const BOM_ROUTE_ROLES = ['admin', 'estimator', 'commercial', 'viewer'] as const
const CLAIM_ROUTE_ROLES = [
  'admin',
  'finance',
  'estimator',
  'pm',
  'sd_pm_pe',
  'commercial',
  'viewer',
] as const
const FINANCE_ROUTE_ROLES = ['admin', 'finance', 'viewer'] as const
const FINANCE_WRITE_ROUTE_ROLES = ['admin', 'finance'] as const
const INVENTORY_MANAGE_ROUTE_ROLES = ['admin', 'procurement'] as const
const INVENTORY_ROUTE_ROLES = [
  'admin',
  'finance',
  'procurement',
  'pm',
  'sd_pm_pe',
  'commercial',
  'viewer',
] as const
const PERMIT_ROUTE_ROLES = [
  'admin',
  'estimator',
  'pm',
  'commercial',
  'sd_pm_pe',
  'safety',
  'viewer',
] as const
const PURCHASE_ORDER_ROUTE_ROLES = [
  'admin',
  'estimator',
  'pm',
  'commercial',
  'sd_pm_pe',
  'procurement',
  'viewer',
] as const
const PROJECT_BOM_ROUTE_ROLES = [
  'admin',
  'estimator',
  'commercial',
  'viewer',
] as const
const PROJECT_COST_ROUTE_ROLES = [
  'admin',
  'finance',
  'commercial',
  'procurement',
  'sd_pm_pe',
  'pm',
  'estimator',
  'viewer',
] as const
const PROJECT_CREATE_ROUTE_ROLES = [
  'admin',
  'sales',
  'commercial',
  'sd_pm_pe',
  'pm',
  'estimator',
] as const

function registerDashboardRoutes(
  templates: readonly string[],
  roles?: readonly AppRole[]
): DashboardRoutePolicy[] {
  return templates.map((template) => ({ template, roles }))
}

/**
 * Complete dashboard page registry. Each template corresponds to a real
 * page under the `/(dashboard)` route group; matching an ancestor never
 * authorizes a child.
 * Route-only aliases and secondary views live here without becoming sidebar
 * items. Dynamic segments match exactly one non-empty pathname segment.
 */
export const DASHBOARD_ROUTE_POLICIES: readonly DashboardRoutePolicy[] = [
  ...registerDashboardRoutes([
    '/assets',
    '/scope',
    '/checklist',
    '/progress',
    '/turnover',
    '/coc',
    '/comments',
    '/assets/[assetId]',
    '/cortex',
    '/crm',
    '/crm/accounts',
    '/crm/accounts/[id]',
    '/crm/opportunities',
    '/crm/opportunities/[id]',
    '/crm/opportunities/[id]/proposal',
    '/crm/opportunities/[id]/proposal/change-requests',
    '/crm/opportunities/[id]/proposal/design',
    '/crm/opportunities/[id]/proposal/inspection',
    '/crm/opportunities/[id]/proposal/pprf',
    '/dashboard',
    '/documents',
    '/pipeline',
    '/pipeline/list',
    '/pipeline/board',
    '/pipeline/conversion',
    '/pipeline/coverage',
    '/process',
    '/projects',
    '/projects/[id]',
    '/projects/[id]/checklist',
    '/projects/[id]/coc',
    '/projects/[id]/comments',
    '/projects/[id]/documents',
    '/projects/[id]/permits',
    '/projects/[id]/progress',
    '/projects/[id]/reports',
    '/projects/[id]/scope',
    '/projects/[id]/turnover',
    '/projects/[id]/vos',
    '/projects/[id]/vos/[voId]',
    '/settings',
    '/settings/profile',
    '/tasks',
  ]),
  ...registerDashboardRoutes(
    ['/admin', '/admin/material-items', '/admin/rate-cards'],
    ADMIN_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    [
      '/admin/data-quality',
      '/admin/mapping-config',
      '/admin/users',
      '/admin/users/[id]',
    ],
    ADMIN_READ_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(['/admin/users/new'], ADMIN_ONLY_ROUTE_ROLES),
  ...registerDashboardRoutes(['/bom'], BOM_ROUTE_ROLES),
  ...registerDashboardRoutes(['/claims', '/claims/[id]'], CLAIM_ROUTE_ROLES),
  ...registerDashboardRoutes(['/claims/new'], [
    'admin',
    'finance',
    'commercial',
    'sd_pm_pe',
    'pm',
  ]),
  ...registerDashboardRoutes(['/crm/accounts/new'], ['admin', 'sales']),
  ...registerDashboardRoutes(['/crm/kyc-queue'], [
    'admin',
    'finance',
    'viewer',
  ]),
  ...registerDashboardRoutes(['/crm/opportunities/new/pprf'], [
    'admin',
    'sales',
  ]),
  ...registerDashboardRoutes(
    [
      '/finance',
      '/finance/cash',
      '/finance/cash/[id]',
      '/finance/journals',
      '/finance/journals/[id]',
      '/finance/ledger',
      '/finance/payables',
      '/finance/payables/[id]',
      '/finance/receivables',
      '/finance/reconciliation',
      '/finance/reconciliation/[id]',
    ],
    FINANCE_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    [
      '/finance/cash/new',
      '/finance/journals/new',
      '/finance/payables/[id]/edit',
      '/finance/payables/new',
      '/finance/reconciliation/new',
    ],
    FINANCE_WRITE_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    [
      '/inventory',
      '/inventory/movements',
      '/inventory/movements/[id]',
      '/inventory/receipts',
      '/inventory/receipts/[id]',
    ],
    INVENTORY_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    ['/inventory/movements/new', '/inventory/receipts/new'],
    INVENTORY_MANAGE_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    ['/invoices', '/invoices/[id]'],
    FINANCE_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(['/permits'], PERMIT_ROUTE_ROLES),
  ...registerDashboardRoutes(['/projects/new'], PROJECT_CREATE_ROUTE_ROLES),
  ...registerDashboardRoutes(['/access', '/projects/[id]/access'], ADMIN_READ_ROUTE_ROLES),
  ...registerDashboardRoutes(['/audit', '/projects/[id]/audit'], [
    'admin',
    'pm',
    'finance',
    'viewer',
  ]),
  ...registerDashboardRoutes(
    ['/billing', '/projects/[id]/billing'],
    FINANCE_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    ['/projects/[id]/bom'],
    PROJECT_BOM_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(
    ['/projects/[id]/bom/togal'],
    ['admin', 'estimator', 'commercial']
  ),
  ...registerDashboardRoutes(
    ['/cost', '/cost/budget', '/projects/[id]/cost', '/projects/[id]/cost/budget'],
    PROJECT_COST_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(['/procurement'], [
    'admin',
    'commercial',
    'sd_pm_pe',
    'pm',
    'procurement',
    'viewer',
  ]),
  ...registerDashboardRoutes(
    [
      '/procurement/deliveries',
      '/procurement/deliveries/[id]',
    ],
    ['admin', 'pm', 'procurement', 'sd_pm_pe', 'viewer']
  ),
  ...registerDashboardRoutes(['/procurement/deliveries/new'], [
    'admin',
    'pm',
    'procurement',
    'sd_pm_pe',
  ]),
  ...registerDashboardRoutes(
    ['/procurement/rfqs', '/procurement/rfqs/[id]'],
    ['admin', 'estimator', 'procurement', 'commercial', 'viewer']
  ),
  ...registerDashboardRoutes(
    ['/purchase-orders', '/purchase-orders/[id]'],
    PURCHASE_ORDER_ROUTE_ROLES
  ),
  ...registerDashboardRoutes(['/reports'], [
    'admin',
    'sales',
    'finance',
    'viewer',
  ]),
  ...registerDashboardRoutes(
    ['/punchlist', '/punchlist/[id]'],
    ['admin', 'pm', 'sd_pm_pe', 'cx', 'safety', 'viewer']
  ),
  ...registerDashboardRoutes(['/punchlist/new'], [
    'admin',
    'pm',
    'sd_pm_pe',
    'cx',
  ]),
  ...registerDashboardRoutes(
    ['/warranty', '/warranty/[id]', '/warranty/cnps'],
    ['admin', 'cx', 'viewer']
  ),
]

function matchesRouteTemplate(template: string, pathname: string): boolean {
  const templateSegments = template.split('/').filter(Boolean)
  const pathnameSegments = pathname.split('/').filter(Boolean)
  if (templateSegments.length !== pathnameSegments.length) return false

  return templateSegments.every((segment, index) => {
    const pathnameSegment = pathnameSegments[index]
    if (!pathnameSegment) return false
    if (segment.startsWith('[') && segment.endsWith(']')) return true
    return segment === pathnameSegment
  })
}

function routeTemplateSpecificity(template: string): number {
  return template
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith('['))
    .length
}

const RESOLVED_ROUTE_POLICIES = [...DASHBOARD_ROUTE_POLICIES].sort(
  (a, b) =>
    routeTemplateSpecificity(b.template) -
    routeTemplateSpecificity(a.template)
)

/** Filter the nav config down to what the given role may see. */
export function visibleNavSections(role: AppRole): NavSection[] {
  const routeRole = canonicalRole(role)
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.visible === false) return false
      if (!item.roles) return true
      return item.roles.includes(routeRole)
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
 * load the given pathname under /(dashboard). External route classes
 * (e.g. /portal/*, /api/*, /auth/*) return true so they're unaffected.
 */
export function canViewPath(role: AppRole, pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname.startsWith('/api/') || pathname.startsWith('/portal/')) return true
  if (pathname.startsWith('/auth/')) return true

  const routeRole = canonicalRole(role)

  // Static templates win over dynamic templates at the same depth. No policy
  // authorizes descendants: every real page template is registered explicitly.
  for (const policy of RESOLVED_ROUTE_POLICIES) {
    if (matchesRouteTemplate(policy.template, pathname)) {
      if (!policy.roles) return true
      return policy.roles.includes(routeRole)
    }
  }

  // A dashboard page must be registered above before any role can load it.
  return false
}
