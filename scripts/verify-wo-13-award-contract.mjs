import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) throw new Error(`WO-13 invariant missing: ${label}`)
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`WO-13 forbidden pattern: ${label}`)
}

const migration = read('supabase/migrations/20260813170000_wo_13_award_handoff.sql')
assertIncludes(migration, 'create table if not exists public.award_handoffs', 'award handoff ledger')
assertIncludes(migration, 'ux_award_handoffs_tenant_source_bom', 'source BOM idempotency')
assertIncludes(migration, 'enable row level security', 'RLS')
assertIncludes(migration, 'audit_award_handoffs', 'audit trigger')
assertNotMatches(migration, /\b(drop|truncate)\s+(table|column|index|constraint|trigger|function)\b/i, 'destructive migration operation')

const automation = read('apps/web/src/lib/operations/award-automation.ts')
assertIncludes(automation, 'runSignedBomAward', 'signed BOM entry point')
assertIncludes(automation, 'pg_advisory_xact_lock', 'concurrent award serialization')
assertIncludes(automation, 'status !== \'locked\'', 'locked BOM gate')
assertIncludes(automation, 'ensureBudget', 'BOQ-derived budget baseline')
assertIncludes(automation, 'costCodes', 'division-derived cost codes')
assertIncludes(automation, 'ensureDraftInvoice', 'DP invoice draft')
assertIncludes(automation, 'AWARD.CARI', 'CARI task')
assertIncludes(automation, 'Project Tracker', 'tracker artifact')
assertIncludes(automation, 'AWARD.CX_ONBOARDING', 'CX onboarding task')
assertIncludes(automation, 'writeAuditLogInTransaction(tx', 'atomic audit')
assertIncludes(automation, 'reused: true', 'idempotent rerun result')
assertIncludes(automation, 'BigInt', 'integer-safe money arithmetic')
assertNotMatches(automation, /Math\.floor\([^\n]*tcv|Number\(line\.lineTotalCents\)/, 'floating or unsafe award money arithmetic')

const action = read('apps/web/src/app/(dashboard)/projects/[id]/bom/award-actions.ts')
assertIncludes(action, 'await db.transaction', 'atomic server action')
assertIncludes(action, 'parseDownPaymentBps', 'exact percentage conversion')
assertNotMatches(action, /Math\.round\([^\n]*downPaymentPercent/, 'floating percentage conversion')
assertIncludes(action, 'reverseAwardHandoff', 'reversible operator path')
assertIncludes(action, 'writeAuditLogInTransaction(tx', 'reversal audit')

const portal = read('apps/web/src/app/portal/bom/[token]/sign-actions.ts')
assertIncludes(portal, "set({ used_at: now })", 'portal signing lock')
assertIncludes(portal, "set({ status: 'locked'", 'BOM lock')
assertIncludes(portal, 'runSignedBomAward(tx', 'portal award in same transaction')

console.log('WO-13 signed BOM award, budget, task, invoice, reversal, and exact-money invariants passed')
