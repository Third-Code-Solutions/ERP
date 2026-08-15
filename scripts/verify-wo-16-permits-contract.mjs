import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`WO-16 invariant missing: ${label}`)
  }
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`WO-16 forbidden pattern: ${label}`)
  }
}

const migration = read(
  'supabase/migrations/20260813190000_wo_16_permits_mobilization.sql'
)
assertNotMatches(
  migration,
  /\b(drop|truncate)\s+(table|column)\b/i,
  'destructive table or column operation'
)
assertNotMatches(migration, /\bscope_items\b|\bscope_item_id\b/i, 'forbidden scope grain')
assertIncludes(migration, 'create table if not exists public.permit_duration_profiles', 'LGU duration profiles')
assertIncludes(migration, 'min_duration_days integer not null', 'minimum LGU duration')
assertIncludes(migration, 'expected_duration_days integer not null', 'expected LGU duration')
assertIncludes(migration, 'max_duration_days integer not null', 'maximum LGU duration')
assertIncludes(migration, 'create table if not exists public.mobilization_readiness', 'mobilization readiness ledger')
assertIncludes(migration, 'commented_fcd_received_at', 'commented FCD return')
assertIncludes(migration, 'po_copies_received_at', 'PO copies return')
assertIncludes(migration, 'cari_received_at', 'CARI return')
assertIncludes(migration, 'ntp_received_at', 'NTP return')
assertIncludes(migration, 'mobilization_readiness_start_gate', 'database start gate')
assertIncludes(migration, 'override_reason is not null', 'authorized override path')
assertIncludes(migration, 'enable row level security', 'permit RLS')
assertIncludes(migration, 'audit_mobilization_readiness', 'readiness audit trigger')

const schema = read('packages/database/src/schema/pre-con.ts')
assertIncludes(schema, "'building_admin_vetting'", 'Building Admin permit type')
assertIncludes(schema, "'lgu_building_permit'", 'LGU permit type')
assertIncludes(schema, "'dole_permit'", 'DOLE permit type')
assertIncludes(schema, "'occupancy_permit'", 'Occupancy permit type')
assertIncludes(schema, "'performance_bond'", 'performance bond type')
assertIncludes(schema, "'surety_bond'", 'surety bond type')
assertIncludes(schema, "'construction_bond'", 'construction bond type')
assertIncludes(schema, 'projectTenantFk', 'tenant-safe permit/project relation')
assertIncludes(schema, 'projectUniqueIdx', 'one readiness ledger per tenant project')

const actions = read('apps/web/src/app/(dashboard)/projects/[id]/permits/actions.ts')
assertIncludes(actions, 'philippineBusinessDays', 'business-day permit forecasts')
assertIncludes(actions, 'resolveDurationProfile', 'tenant-maintained duration snapshot')
assertIncludes(actions, 'learnPermitDuration', 'LGU actual-duration learning')
assertIncludes(actions, 'recordMobilizationInput', 'four-return recording action')
assertIncludes(actions, 'startMobilization', 'mobilization start action')
assertIncludes(actions, 'precon.override_mobilization', 'override capability gate')
assertIncludes(actions, 'Mobilization requires all four returns or an authorized override.', 'server start gate')
assertIncludes(actions, 'writeAuditLogInTransaction', 'permit/readiness audit')

const panel = read(
  'apps/web/src/app/(dashboard)/projects/[id]/permits/mobilization-readiness-panel.tsx'
)
assertIncludes(panel, 'Commented FCD', 'FCD readiness tile')
assertIncludes(panel, 'PO copies', 'PO readiness tile')
assertIncludes(panel, 'CARI', 'CARI readiness tile')
assertIncludes(panel, 'NTP from Building Admin', 'NTP readiness tile')
assertIncludes(panel, 'Override reason (required if any return is missing)', 'visible override requirement')
assertIncludes(panel, 'role={error ? \'alert\' : \'status\'}', 'accessible mutation feedback')

const globalPage = read('apps/web/src/app/(dashboard)/permits/page.tsx')
assertIncludes(globalPage, 'eq(projects.tenant_id, permits.tenant_id)', 'tenant-safe global permit join')
const sweep = read('apps/web/src/lib/inngest-permits.ts')
assertIncludes(sweep, 'eq(projects.tenant_id, permits.tenant_id)', 'tenant-safe permit sweep join')

console.log('WO-16 permits, LGU duration learning, four-return mobilization gate, tenant joins, and audit invariants passed')
