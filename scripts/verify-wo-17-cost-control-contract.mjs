import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`WO-17 invariant missing: ${label}`)
  }
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`WO-17 forbidden pattern: ${label}`)
  }
}

const migration = read(
  'supabase/migrations/20260813200000_wo_17_cost_control_v1.sql'
)
assertNotMatches(
  migration,
  /\b(drop|truncate)\s+(table|column)\b/i,
  'destructive table or column operation'
)
assertNotMatches(migration, /\bscope_items\b|\bscope_item_id\b/i, 'forbidden scope grain')
assertIncludes(migration, 'add column if not exists bom_line_item_id uuid', 'supplier-bill BOM-line evidence')
assertIncludes(migration, 'supplier_bill_lines_bom_line_tenant_fk', 'tenant-safe BOM-line foreign key')
assertIncludes(migration, 'guard_supplier_bill_cost_dimension', 'supplier-bill cost-dimension guard')
assertIncludes(migration, 'Supplier Bill BOM line must match Purchase Order line', 'PO/BOM-line lineage enforcement')

const query = read('apps/web/src/lib/operations/project-cost-control.ts')
assertIncludes(query, 'with budget as', 'budget CTE')
assertIncludes(query, 'commitment as', 'PO commitment CTE')
assertIncludes(query, 'actual as', 'posted supplier-bill actual CTE')
assertIncludes(query, 'unreconciled as', 'separate manual/legacy evidence CTE')
assertIncludes(query, "and bill.status = 'posted'", 'posted-bill-only actuals')
assertIncludes(query, 'po_line.bom_line_item_id is not distinct from bill_line.bom_line_item_id', 'BOM-line actual lineage')
assertIncludes(query, 'cost_code_id, bom_line_item_id', 'cost-code and BOM-line grain')
assertIncludes(query, 'computeCostControlMetrics', 'remaining and variance calculation')

const page = read('apps/web/src/app/(dashboard)/projects/[id]/cost/page.tsx')
assertIncludes(page, 'getProjectCostControl', 'primary cost page cost-control query')
assertIncludes(page, '<CostControlTable', 'BOM-line cost-control table')
assertIncludes(page, 'rows={costControl.rows}', 'cost-control rows binding')
assertIncludes(page, 'showBomDetails={access.bom}', 'role-aware BOM detail visibility')
assertIncludes(
  page,
  'showCommitments={access.purchaseOrders}',
  'role-aware commitment visibility'
)
assertIncludes(page, 'costControl.totals.committedCents', 'committed amount from cost-control query')
assertIncludes(page, 'costControl.totals.actualCents', 'posted actual amount from cost-control query')
assertIncludes(page, 'costControl.totals.unreconciledCents', 'visible unreconciled evidence')
assertNotMatches(page, /sum\(purchaseOrders\.total_cents\)/, 'gross PO total used as commitment truth')
assertNotMatches(page, /entries\.reduce\(\(acc, e\) => e\.amount_cents/, 'manual cost log used as posted actual truth')
assertIncludes(page, 'Posted actual by category', 'posted-actual category label')

const table = read('apps/web/src/components/cost/cost-control-table.tsx')
assertIncludes(table, '<th>BOM line</th>', 'BOM-line column')
assertIncludes(table, '<th className="num">Committed</th>', 'committed column')
assertIncludes(table, '<th className="num">Actual</th>', 'actual column')
assertIncludes(table, 'row.remainingCents', 'remaining display')
assertIncludes(table, 'row.varianceCents', 'variance display')

console.log('WO-17 BOM-line cost control, posted actual lineage, primary-page wiring, and variance invariants passed')
