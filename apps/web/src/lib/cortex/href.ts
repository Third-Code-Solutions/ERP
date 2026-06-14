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
      return n.projectId ? `/projects/${n.projectId}/bom` : '/bom'
    case 'document':
      return n.projectId ? `/projects/${n.projectId}/documents` : '/documents'
    case 'invoice':
      return n.projectId ? `/projects/${n.projectId}/billing` : '/invoices'
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
}

export function cortexColor(type: string): string {
  return CORTEX_TYPE_COLOR[type] ?? '#64748b'
}
