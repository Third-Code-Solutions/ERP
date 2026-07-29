import { describe, expect, it } from 'vitest'
import { isCortexRefTable } from './entity-registry'
import {
  CORTEX_RECORD_ROUTE_TABLES,
  cortexRecordRoute,
} from './record-route'

const RECORD_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex dashboard record routes', () => {
  it.each([
    ['/crm/accounts', 'accounts'],
    ['/crm/opportunities', 'opportunities'],
    ['/invoices', 'invoices'],
    ['/claims', 'progress_claims'],
    ['/finance/cash', 'cash_transactions'],
    ['/finance/journals', 'journal_entries'],
    ['/finance/payables', 'supplier_bills'],
    ['/finance/reconciliation', 'bank_statements'],
    ['/inventory/movements', 'stock_movements'],
    ['/inventory/receipts', 'stock_receipts'],
    ['/procurement/deliveries', 'delivery_schedules'],
    ['/procurement/rfqs', 'rfqs'],
    ['/purchase-orders', 'purchase_orders'],
    ['/punchlist', 'punchlist_items'],
    ['/warranty', 'warranty_tickets'],
  ])('maps %s detail to %s', (path, refTable) => {
    expect(cortexRecordRoute(`${path}/${RECORD_ID}`)).toEqual({
      refTable,
      refId: RECORD_ID,
    })
  })

  it('uses the variation-order ID instead of the parent Project ID', () => {
    expect(
      cortexRecordRoute(`/projects/${PROJECT_ID}/vos/${RECORD_ID}/`)
    ).toEqual({
      refTable: 'variation_orders',
      refId: RECORD_ID,
    })
  })

  it.each([
    '/invoices',
    '/invoices/new',
    `/invoices/${RECORD_ID}/print`,
    `/projects/${PROJECT_ID}`,
    `/projects/${PROJECT_ID}/cost`,
    '/portal/project/token',
    '/finance/cash/not-a-uuid',
    `/finance/cash/${RECORD_ID}?mode=edit`,
    `/admin/users/${RECORD_ID}`,
    '',
  ])('fails closed for unsupported route %s', (path) => {
    expect(cortexRecordRoute(path)).toBeNull()
  })

  it('uses only canonical Cortex source tables', () => {
    expect(new Set(CORTEX_RECORD_ROUTE_TABLES).size).toBe(
      CORTEX_RECORD_ROUTE_TABLES.length
    )
    for (const refTable of CORTEX_RECORD_ROUTE_TABLES) {
      expect(isCortexRefTable(refTable)).toBe(true)
    }
  })
})
