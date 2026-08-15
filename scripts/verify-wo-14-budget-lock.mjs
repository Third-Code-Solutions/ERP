import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) throw new Error(`WO-14 invariant missing: ${label}`)
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`WO-14 forbidden pattern: ${label}`)
}

const migration = read('supabase/migrations/20260813180000_wo_14_allowable_budget_lock.sql')
assertIncludes(migration, 'add column if not exists original_gp_margin_bps integer not null default 0', 'margin snapshot')
assertIncludes(migration, 'snapshot_project_budget_margin', 'approval-time snapshot trigger')
assertIncludes(migration, 'new.original_gp_margin_bps is distinct from old.original_gp_margin_bps', 'snapshot immutability')
assertIncludes(migration, 'raise exception \'Use the Project Budget workflow\'', 'workflow-only approved updates')
assertIncludes(migration, 'Only a draft Project Budget can be deleted', 'non-destructive baseline lifecycle')
assertIncludes(migration, 'create or replace function public.submit_project_budget', 'submit workflow wrapper')
assertIncludes(migration, 'create or replace function public.review_project_budget', 'approval workflow wrapper')

const schemaSql = read('supabase/migrations/20260726242000_project_budget_schema.sql')
assertIncludes(schemaSql, 'create unique index if not exists ux_project_budgets_current_approved', 'one approved baseline')
const controls = read('supabase/migrations/20260726243000_project_budget_controls.sql')
assertIncludes(controls, 'Project Budget creator cannot approve their own revision', 'creator separation')
assertIncludes(controls, 'Commercial and Finance approvals require separate actors', 'dual approval separation')
assertIncludes(controls, 'create trigger guard_project_budget', 'budget trigger')
assertIncludes(controls, 'create trigger guard_project_budget_line', 'budget-line trigger')
assertIncludes(controls, 'Only draft Project Budget lines can change', 'line lock')
assertIncludes(controls, 'create or replace function public.create_project_budget_revision', 'approved baseline revision boundary')

const schema = read('packages/database/src/schema/budgets.ts')
assertIncludes(schema, "original_gp_margin_bps: integer('original_gp_margin_bps')", 'Drizzle margin snapshot')
assertIncludes(schema, 'currentApprovedIdx', 'Drizzle approved baseline uniqueness')
assertIncludes(schema, "'ux_project_budgets_current_approved'", 'Drizzle approved baseline index name')

const actions = read('apps/web/src/app/(dashboard)/projects/[id]/cost/budget/actions.ts')
assertIncludes(actions, 'parsePesosToCents', 'exact budget amount parsing')
assertNotMatches(actions, /Math\.round\([^\n]*amountPhp|z\.coerce\.number\(\)\.positive\(\)\.max\(1_000_000_000\)/, 'floating budget amount conversion')
assertIncludes(actions, 'public.submit_project_budget', 'server workflow submit')
assertIncludes(actions, 'public.review_project_budget', 'server workflow approval')
assertIncludes(actions, 'public.create_project_budget_revision', 'server revision workflow')
assertIncludes(actions, 'writeAuditLog', 'budget audit')

const costPage = read('apps/web/src/app/(dashboard)/projects/[id]/cost/page.tsx')
assertIncludes(costPage, 'original_gp_margin_bps: projectBudgets.original_gp_margin_bps', 'cost snapshot source')
assertIncludes(costPage, 'originalGpMarginBps: approvedBudget?.original_gp_margin_bps', 'cost snapshot input')

console.log('WO-14 budget approval, margin snapshot, baseline lock, revision, and exact-money invariants passed')
