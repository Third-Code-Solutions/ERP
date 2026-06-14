/**
 * Maps a Cortex graph node to its canonical ERP route, so the knowledge graph
 * can navigate straight into the record (project, account, BOM, invoice, …).
 * Project-scoped records route through their project tab when we know the
 * project, else fall back to the module list. Returns null when there is no
 * meaningful destination.
 */
export interface CortexHrefNode {
  type: string
  refId: string
  projectId: string | null
}

export function cortexHref(n: CortexHrefNode): string | null {
  const p = n.projectId
  switch (n.type) {
    case 'project':
      return `/projects/${n.refId}`
    case 'account':
      return `/crm/accounts/${n.refId}`
    case 'opportunity':
      return `/crm/opportunities/${n.refId}`
    case 'employee':
      return `/admin/users/${n.refId}`
    case 'purchase_order':
      return `/purchase-orders/${n.refId}`
    case 'task':
      return '/tasks'
    case 'bom':
      return p ? `/projects/${p}/bom` : '/bom'
    case 'document':
      return p ? `/projects/${p}/documents` : '/documents'
    case 'invoice':
      return p ? `/projects/${p}/billing` : '/invoices'
    // Whole-ERP coverage
    case 'scope_item':
      return p ? `/projects/${p}/scope` : null
    case 'change_order':
      return p ? `/projects/${p}/vos` : null
    case 'certificate':
      return p ? `/projects/${p}/coc` : null
    case 'schedule_event':
      return p ? `/projects/${p}/progress` : null
    case 'weekly_report':
      return p ? `/projects/${p}/reports` : null
    case 'contract':
      return p ? `/projects/${p}` : null
    case 'permit':
      return '/permits'
    case 'claim':
      return '/claims'
    case 'ticket':
      return '/warranty'
    case 'delivery':
      return '/procurement/deliveries'
    case 'rfq':
      return '/procurement/rfqs'
    case 'punchlist':
      return '/punchlist'
    case 'material':
      return '/admin/material-items'
    case 'contact':
      return '/crm/accounts'
    default:
      return null
  }
}

export const CORTEX_TYPE_LABEL: Record<string, string> = {
  project: 'Project',
  account: 'Account',
  employee: 'Person',
  opportunity: 'Opportunity',
  document: 'Document',
  bom: 'BOM',
  purchase_order: 'Purchase Order',
  invoice: 'Invoice',
  task: 'Task',
  vendor: 'Vendor',
  scope_item: 'Scope Item',
  change_order: 'Variation Order',
  schedule_event: 'Schedule',
  contact: 'Contact',
  permit: 'Permit',
  claim: 'Claim',
  ticket: 'Warranty Ticket',
  delivery: 'Delivery',
  rfq: 'RFQ',
  contract: 'Contract',
  certificate: 'Certificate',
  punchlist: 'Punchlist',
  inspection: 'Inspection',
  design: 'Design File',
  change_request: 'Change Request',
  material: 'Material',
  weekly_report: 'Weekly Report',
}

export const CORTEX_TYPE_COLOR: Record<string, string> = {
  project: '#1f3864',
  account: '#0e7490',
  employee: '#7c3aed',
  opportunity: '#b45309',
  document: '#475569',
  bom: '#15803d',
  purchase_order: '#9333ea',
  invoice: '#be123c',
  task: '#0369a1',
  vendor: '#0d9488',
  scope_item: '#65a30d',
  change_order: '#ca8a04',
  schedule_event: '#2563eb',
  contact: '#db2777',
  permit: '#ea580c',
  claim: '#dc2626',
  ticket: '#e11d48',
  delivery: '#0891b2',
  rfq: '#7c3aed',
  contract: '#4f46e5',
  certificate: '#16a34a',
  punchlist: '#d97706',
  inspection: '#0284c7',
  design: '#9333ea',
  change_request: '#c026d3',
  material: '#059669',
  weekly_report: '#475569',
}

export function cortexColor(type: string): string {
  return CORTEX_TYPE_COLOR[type] ?? '#64748b'
}
