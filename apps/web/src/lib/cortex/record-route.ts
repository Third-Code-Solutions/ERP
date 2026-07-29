import { isCortexRefTable } from './entity-registry'

const UUID_SEGMENT =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

interface RecordRouteDefinition {
  pattern: RegExp
  refTable: string
  refIdGroup?: number
}

export interface CortexRecordRoute {
  refTable: string
  refId: string
}

function direct(path: string, refTable: string): RecordRouteDefinition {
  return {
    pattern: new RegExp(`^${path}/(${UUID_SEGMENT})/?$`, 'i'),
    refTable,
  }
}

const RECORD_ROUTES = Object.freeze([
  direct('/crm/accounts', 'accounts'),
  direct('/crm/opportunities', 'opportunities'),
  direct('/invoices', 'invoices'),
  direct('/claims', 'progress_claims'),
  direct('/finance/cash', 'cash_transactions'),
  direct('/finance/journals', 'journal_entries'),
  direct('/finance/payables', 'supplier_bills'),
  direct('/finance/reconciliation', 'bank_statements'),
  direct('/inventory/movements', 'stock_movements'),
  direct('/inventory/receipts', 'stock_receipts'),
  direct('/procurement/deliveries', 'delivery_schedules'),
  direct('/procurement/rfqs', 'rfqs'),
  direct('/purchase-orders', 'purchase_orders'),
  {
    pattern: new RegExp(
      `^/projects/(${UUID_SEGMENT})/vos/(${UUID_SEGMENT})/?$`,
      'i'
    ),
    refTable: 'variation_orders',
    refIdGroup: 2,
  },
  direct('/punchlist', 'punchlist_items'),
  direct('/warranty', 'warranty_tickets'),
] satisfies RecordRouteDefinition[])

/**
 * Resolve an exact dashboard detail route to its canonical Cortex source.
 * Unsupported or malformed paths fail closed.
 */
export function cortexRecordRoute(
  pathname: string
): CortexRecordRoute | null {
  for (const definition of RECORD_ROUTES) {
    const match = definition.pattern.exec(pathname)
    if (!match || !isCortexRefTable(definition.refTable)) continue
    const refId = match[definition.refIdGroup ?? 1]
    if (!refId) return null
    return { refTable: definition.refTable, refId }
  }
  return null
}

export const CORTEX_RECORD_ROUTE_TABLES = Object.freeze(
  RECORD_ROUTES.map(({ refTable }) => refTable)
)
