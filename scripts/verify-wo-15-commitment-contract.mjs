import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`WO-15 invariant missing: ${label}`)
  }
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`WO-15 forbidden pattern: ${label}`)
  }
}

const migration = read(
  'supabase/migrations/20260814130000_wo_15_budget_commitment.sql'
)
assertNotMatches(
  migration,
  /\b(drop|truncate)\s+(table|column|index|constraint|trigger|function)\b/i,
  'destructive migration operation'
)
assertNotMatches(migration, /\bscope_items\b|\bscope_item_id\b/i, 'forbidden scope grain')
assertIncludes(migration, 'create or replace function public.enforce_project_budget_commitment', 'commitment trigger replacement')
assertIncludes(migration, 'project_budget_lines budget_line', 'approved budget-line join')
assertIncludes(migration, 'budget_line.bom_line_item_id = line.bom_line_item_id', 'PO-to-budget BOM-line identity')
assertIncludes(migration, 'budget_line.cost_code_id = line.cost_code_id', 'PO-to-budget cost-code identity')
assertIncludes(migration, 'v_current.bom_line_item_id', 'BOM-line grouped commitment')
assertIncludes(migration, 'Purchase Order commitment exceeds approved budget line allowable', 'budget-line overrun guard')
assertIncludes(migration, 'using errcode = \'23514\'', 'constraint-classified commitment failures')

const money = read('apps/web/src/lib/operations/purchase-order-money.ts')
assertIncludes(money, 'VAT_BASIS_POINTS = 1_200n', 'unchanged 12% VAT calculation')
assertIncludes(money, 'WITHHOLDING_TAX_BASIS_POINTS = 200n', 'unchanged 2% withholding calculation')
assertIncludes(money, 'export function calculatePurchaseOrderTotals', 'existing PO tax helper retained')

const poStatusEnum = read('packages/database/src/schema/enums.ts')
assertIncludes(poStatusEnum, "'pending_pm_approval'", 'existing PO approval timeline')
assertIncludes(poStatusEnum, "'pending_commercial_approval'", 'existing Commercial approval timeline')
assertIncludes(poStatusEnum, "'pending_scm_issuance'", 'existing SCM issuance timeline')
assertIncludes(poStatusEnum, "'issued'", 'existing issued state')

const actions = read('apps/web/src/app/(dashboard)/procurement/actions.ts')
assertIncludes(actions, 'submitPoForPmApproval', 'existing PO submission action')
assertIncludes(actions, 'Blocked budget requires a PO line joined to an approved budget line by bom_line_item_id and Cost Code', 'safe budget-line error surfacing')
assertIncludes(actions, 'Purchase Order commitment exceeds approved budget line allowable', 'safe overrun error surfacing')

const detailPage = read('apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx')
assertIncludes(detailPage, 'const budgetWarning', 'pre-submission budget warning derivation')
assertIncludes(detailPage, 'budgetOverrunCostCodes', 'cost-code-specific warning')
assertIncludes(detailPage, 'role="alert"', 'accessible budget warning')

const statusActions = read('apps/web/src/app/(dashboard)/purchase-orders/[id]/po-status-actions.tsx')
assertIncludes(statusActions, 'window.confirm', 'explicit warning acknowledgement before submission')
assertIncludes(statusActions, 'budgetWarning', 'status action warning input')
assertIncludes(statusActions, 'Submit for PM approval', 'existing PO submission control retained')

const promptPack = read('docs/PROMPTS.md')
assertIncludes(promptPack, 'Delegation-of-Approval routing by amount band [PASTE ABI MATRIX HERE]', 'ABI matrix source blocker remains explicit')

console.log('WO-15 budget-line commitment and preserved PO workflow invariants passed; ABI DoA configuration remains source-blocked')
