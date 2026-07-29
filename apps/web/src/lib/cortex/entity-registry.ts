export interface CortexHrefNode {
  type: string
  refId: string
  projectId: string | null
}

export interface CortexEntityDefinition {
  label: string
  color: string
  accessPath: string
  refTables: readonly string[]
  href: (node: CortexHrefNode) => string
}

const list =
  (href: string) =>
  (_node: CortexHrefNode): string =>
    href

const direct =
  (prefix: string) =>
  (node: CortexHrefNode): string =>
    `${prefix}/${node.refId}`

const projectTab =
  (tab: string, fallback: string) =>
  (node: CortexHrefNode): string =>
    node.projectId ? `/projects/${node.projectId}${tab}` : fallback

export const CORTEX_ENTITY_REGISTRY = {
  employee: {
    label: 'Person',
    color: '#7c3aed',
    accessPath: '/admin',
    refTables: ['users'],
    href: direct('/admin/users'),
  },
  project: {
    label: 'Project',
    color: '#1f3864',
    accessPath: '/projects',
    refTables: ['projects'],
    href: direct('/projects'),
  },
  opportunity: {
    label: 'Opportunity',
    color: '#b45309',
    accessPath: '/pipeline/board',
    refTables: ['opportunities'],
    href: direct('/crm/opportunities'),
  },
  account: {
    label: 'Account',
    color: '#0e7490',
    accessPath: '/crm/accounts',
    refTables: ['accounts'],
    href: direct('/crm/accounts'),
  },
  scope_item: {
    label: 'Scope Item',
    color: '#65a30d',
    accessPath: '/projects',
    refTables: ['scope_items'],
    href: projectTab('/scope', '/projects'),
  },
  bom: {
    label: 'BOM',
    color: '#15803d',
    accessPath: '/bom',
    refTables: ['boms'],
    href: projectTab('/bom', '/bom'),
  },
  bom_line: {
    label: 'BOM Line',
    color: '#166534',
    accessPath: '/bom',
    refTables: ['bom_line_items'],
    href: projectTab('/bom', '/bom'),
  },
  vendor: {
    label: 'Vendor',
    color: '#0d9488',
    accessPath: '/purchase-orders',
    refTables: ['vendors'],
    href: list('/purchase-orders'),
  },
  purchase_order: {
    label: 'Purchase Order',
    color: '#9333ea',
    accessPath: '/purchase-orders',
    refTables: ['purchase_orders'],
    href: direct('/purchase-orders'),
  },
  po_line: {
    label: 'Purchase Order Line',
    color: '#a855f7',
    accessPath: '/purchase-orders',
    refTables: ['po_line_items'],
    href: list('/purchase-orders'),
  },
  invoice: {
    label: 'Invoice',
    color: '#be123c',
    accessPath: '/invoices',
    refTables: ['invoices'],
    href: direct('/invoices'),
  },
  invoice_line: {
    label: 'Invoice Line',
    color: '#e11d48',
    accessPath: '/invoices',
    refTables: [],
    href: list('/invoices'),
  },
  milestone: {
    label: 'Milestone',
    color: '#1d4ed8',
    accessPath: '/projects',
    refTables: [],
    href: projectTab('/progress', '/projects'),
  },
  cost_line: {
    label: 'Cost Entry',
    color: '#b91c1c',
    accessPath: '/projects',
    refTables: ['cost_entries'],
    href: projectTab('/cost', '/projects'),
  },
  task: {
    label: 'Task',
    color: '#0369a1',
    accessPath: '/tasks',
    refTables: ['daily_tasks', 'pre_con_checklist_items'],
    href: list('/tasks'),
  },
  announcement: {
    label: 'Announcement',
    color: '#4f46e5',
    accessPath: '/tasks',
    refTables: [],
    href: list('/dashboard'),
  },
  schedule_event: {
    label: 'Schedule',
    color: '#2563eb',
    accessPath: '/projects',
    refTables: ['master_schedules'],
    href: projectTab('/progress', '/projects'),
  },
  document: {
    label: 'Document',
    color: '#475569',
    accessPath: '/documents',
    refTables: ['documents'],
    href: projectTab('/documents', '/documents'),
  },
  change_order: {
    label: 'Variation Order',
    color: '#ca8a04',
    accessPath: '/projects',
    refTables: ['variation_orders'],
    href: (node) =>
      node.projectId
        ? `/projects/${node.projectId}/vos/${node.refId}`
        : '/projects',
  },
  audit_event: {
    label: 'Audit Event',
    color: '#334155',
    accessPath: '/admin',
    refTables: [],
    href: projectTab('/audit', '/admin'),
  },
  contact: {
    label: 'Contact',
    color: '#db2777',
    accessPath: '/crm/accounts',
    refTables: ['contacts'],
    href: list('/crm/accounts'),
  },
  permit: {
    label: 'Permit',
    color: '#ea580c',
    accessPath: '/permits',
    refTables: ['permits'],
    href: projectTab('/permits', '/permits'),
  },
  claim: {
    label: 'Claim',
    color: '#dc2626',
    accessPath: '/claims',
    refTables: ['progress_claims'],
    href: direct('/claims'),
  },
  ticket: {
    label: 'Warranty Ticket',
    color: '#e11d48',
    accessPath: '/warranty',
    refTables: ['warranty_tickets'],
    href: direct('/warranty'),
  },
  delivery: {
    label: 'Delivery',
    color: '#0891b2',
    accessPath: '/procurement/deliveries',
    refTables: ['delivery_schedules'],
    href: direct('/procurement/deliveries'),
  },
  rfq: {
    label: 'RFQ',
    color: '#7c3aed',
    accessPath: '/procurement/rfqs',
    refTables: ['rfqs'],
    href: direct('/procurement/rfqs'),
  },
  contract: {
    label: 'Contract',
    color: '#4f46e5',
    accessPath: '/projects',
    refTables: ['contracts'],
    href: projectTab('', '/projects'),
  },
  certificate: {
    label: 'Certificate',
    color: '#16a34a',
    accessPath: '/projects',
    refTables: ['certificates_of_completion'],
    href: projectTab('/coc', '/projects'),
  },
  punchlist: {
    label: 'Punchlist',
    color: '#d97706',
    accessPath: '/punchlist',
    refTables: ['punchlist_items'],
    href: direct('/punchlist'),
  },
  inspection: {
    label: 'Inspection',
    color: '#0284c7',
    accessPath: '/pipeline/board',
    refTables: ['site_inspections'],
    href: direct('/inspection'),
  },
  design: {
    label: 'Design File',
    color: '#9333ea',
    accessPath: '/pipeline/board',
    refTables: ['design_files'],
    href: list('/pipeline/board'),
  },
  change_request: {
    label: 'Change Request',
    color: '#c026d3',
    accessPath: '/pipeline/board',
    refTables: ['change_requests'],
    href: list('/pipeline/board'),
  },
  material: {
    label: 'Material',
    color: '#059669',
    accessPath: '/bom',
    refTables: ['material_items'],
    href: list('/admin/material-items'),
  },
  weekly_report: {
    label: 'Weekly Report',
    color: '#475569',
    accessPath: '/projects',
    refTables: ['weekly_reports'],
    href: direct('/weekly-report'),
  },
  fiscal_period: {
    label: 'Fiscal Period',
    color: '#0f766e',
    accessPath: '/finance',
    refTables: ['fiscal_periods'],
    href: list('/finance'),
  },
  ledger_account: {
    label: 'Ledger Account',
    color: '#0e7490',
    accessPath: '/finance',
    refTables: ['ledger_accounts'],
    href: list('/finance/ledger'),
  },
  journal_entry: {
    label: 'Journal Entry',
    color: '#1d4ed8',
    accessPath: '/finance',
    refTables: ['journal_entries'],
    href: direct('/finance/journals'),
  },
  journal_line: {
    label: 'Journal Line',
    color: '#2563eb',
    accessPath: '/finance',
    refTables: ['journal_lines'],
    href: list('/finance/ledger'),
  },
  supplier_bill: {
    label: 'Supplier Bill',
    color: '#9f1239',
    accessPath: '/finance/payables',
    refTables: ['supplier_bills'],
    href: direct('/finance/payables'),
  },
  cash_account: {
    label: 'Cash Account',
    color: '#047857',
    accessPath: '/finance/cash',
    refTables: ['cash_accounts'],
    href: list('/finance/cash'),
  },
  cash_transaction: {
    label: 'Cash Transaction',
    color: '#059669',
    accessPath: '/finance/cash',
    refTables: ['cash_transactions'],
    href: list('/finance/cash'),
  },
  bank_statement: {
    label: 'Bank Statement',
    color: '#0f766e',
    accessPath: '/finance/reconciliation',
    refTables: ['bank_statements'],
    href: direct('/finance/reconciliation'),
  },
  warehouse: {
    label: 'Warehouse',
    color: '#57534e',
    accessPath: '/inventory',
    refTables: ['warehouses'],
    href: list('/inventory'),
  },
  stock_receipt: {
    label: 'Stock Receipt',
    color: '#15803d',
    accessPath: '/inventory',
    refTables: ['stock_receipts'],
    href: direct('/inventory/receipts'),
  },
  stock_ledger_entry: {
    label: 'Stock Ledger Entry',
    color: '#166534',
    accessPath: '/inventory',
    refTables: ['stock_ledger_entries'],
    href: list('/inventory'),
  },
  cost_code: {
    label: 'Cost Code',
    color: '#a16207',
    accessPath: '/projects',
    refTables: ['cost_codes'],
    href: projectTab('/cost', '/projects'),
  },
  project_budget: {
    label: 'Project Budget',
    color: '#854d0e',
    accessPath: '/projects',
    refTables: ['project_budgets'],
    href: projectTab('/cost/budget', '/projects'),
  },
  stock_movement: {
    label: 'Stock Movement',
    color: '#4d7c0f',
    accessPath: '/inventory',
    refTables: ['stock_movements'],
    href: direct('/inventory/movements'),
  },
} as const satisfies Record<string, CortexEntityDefinition>

export type CortexEntityType = keyof typeof CORTEX_ENTITY_REGISTRY

export const CORTEX_ENTITY_TYPES = Object.freeze(
  Object.keys(CORTEX_ENTITY_REGISTRY) as CortexEntityType[]
)

export const CORTEX_REF_TABLES = Object.freeze(
  CORTEX_ENTITY_TYPES.flatMap((type) => [
    ...CORTEX_ENTITY_REGISTRY[type].refTables,
  ])
)

const REF_TABLE_SET = new Set<string>(CORTEX_REF_TABLES)

export function isCortexRefTable(value: string): boolean {
  return REF_TABLE_SET.has(value)
}

export function cortexEntityDefinition(
  type: string
): CortexEntityDefinition | null {
  return CORTEX_ENTITY_REGISTRY[type as CortexEntityType] ?? null
}

export function cortexHref(node: CortexHrefNode): string | null {
  return cortexEntityDefinition(node.type)?.href(node) ?? null
}

export const CORTEX_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CORTEX_ENTITY_TYPES.map((type) => [
    type,
    CORTEX_ENTITY_REGISTRY[type].label,
  ])
)

export const CORTEX_TYPE_COLOR: Record<string, string> = Object.fromEntries(
  CORTEX_ENTITY_TYPES.map((type) => [
    type,
    CORTEX_ENTITY_REGISTRY[type].color,
  ])
)

export function cortexColor(type: string): string {
  return cortexEntityDefinition(type)?.color ?? '#64748b'
}
