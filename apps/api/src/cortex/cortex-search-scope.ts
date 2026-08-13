import type { ErpRole } from '../auth/current-principal.decorator'

type CortexNodeType = string

const ADMIN_SCOPE: null = null

const VIEWER_SCOPE: readonly CortexNodeType[] = [
  'task',
  'announcement',
  'document',
]

const SALES_SCOPE: readonly CortexNodeType[] = [
  'project',
  'opportunity',
  'account',
  'contact',
  'scope_item',
  'milestone',
  'task',
  'announcement',
  'schedule_event',
  'document',
  'change_order',
  'design',
  'change_request',
  'inspection',
  'contract',
  'certificate',
  'weekly_report',
]

const COMMERCIAL_SCOPE: readonly CortexNodeType[] = [
  ...SALES_SCOPE,
  'bom',
  'bom_line',
  'vendor',
  'purchase_order',
  'po_line',
  'permit',
  'rfq',
  'delivery',
  'claim',
  'material',
  'warehouse',
  'stock_receipt',
  'stock_ledger_entry',
  'cost_code',
  'project_budget',
  'stock_movement',
]

const SD_PM_PE_SCOPE: readonly CortexNodeType[] = [
  ...SALES_SCOPE,
  'vendor',
  'purchase_order',
  'po_line',
  'permit',
  'delivery',
  'claim',
  'punchlist',
  'material',
  'warehouse',
  'stock_receipt',
  'stock_ledger_entry',
  'cost_code',
  'project_budget',
  'stock_movement',
]

const FINANCE_SCOPE: readonly CortexNodeType[] = [
  ...SALES_SCOPE,
  'invoice',
  'invoice_line',
  'claim',
  'cost_line',
  'fiscal_period',
  'ledger_account',
  'journal_entry',
  'journal_line',
  'supplier_bill',
  'cash_account',
  'cash_transaction',
  'bank_statement',
  'warehouse',
  'stock_receipt',
  'stock_ledger_entry',
  'cost_code',
  'project_budget',
  'stock_movement',
]

const PROCUREMENT_SCOPE: readonly CortexNodeType[] = [
  'project',
  'opportunity',
  'account',
  'contact',
  'scope_item',
  'task',
  'announcement',
  'document',
  'vendor',
  'purchase_order',
  'po_line',
  'delivery',
  'rfq',
  'contract',
  'certificate',
  'material',
  'warehouse',
  'stock_receipt',
  'stock_ledger_entry',
  'stock_movement',
]

const DESIGN_SCOPE: readonly CortexNodeType[] = [
  ...SALES_SCOPE,
]

const SAFETY_SCOPE: readonly CortexNodeType[] = [
  'task',
  'announcement',
  'document',
  'permit',
  'punchlist',
  'inspection',
]

const CX_SCOPE: readonly CortexNodeType[] = [
  'account',
  'contact',
  'task',
  'announcement',
  'document',
  'punchlist',
  'ticket',
]

const ROLE_SCOPES: Record<Exclude<ErpRole, 'owner' | 'admin'>, readonly CortexNodeType[]> = {
  estimator: COMMERCIAL_SCOPE,
  pm: SD_PM_PE_SCOPE,
  sales: SALES_SCOPE,
  commercial: COMMERCIAL_SCOPE,
  design: DESIGN_SCOPE,
  sd_pm_pe: SD_PM_PE_SCOPE,
  finance: FINANCE_SCOPE,
  procurement: PROCUREMENT_SCOPE,
  safety: SAFETY_SCOPE,
  cx: CX_SCOPE,
  viewer: VIEWER_SCOPE,
}

/**
 * Server-owned Cortex scope. Never accept a node-type list from the browser.
 * Admin/owner are unrestricted because the capability guard already requires
 * an authenticated ERP principal; every other role is deny-by-default.
 */
export function cortexSearchNodeTypeScope(
  role: ErpRole
): string[] | null {
  if (role === 'owner' || role === 'admin') return ADMIN_SCOPE
  return [...new Set(ROLE_SCOPES[role] ?? [])]
}
