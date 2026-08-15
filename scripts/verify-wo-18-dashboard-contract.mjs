import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`WO-18 invariant missing: ${label}`)
  }
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`WO-18 forbidden pattern: ${label}`)
  }
}

const queries = read('apps/web/src/lib/dashboard-queries.ts')
assertIncludes(queries, 'export interface ManagementDashboardData', 'management dashboard data contract')
assertIncludes(queries, 'projectMargins: ManagementProjectMarginRow[]', 'project margin rows')
assertIncludes(queries, 'slaBreachesByBu: ManagementSlaBreachRow[]', 'business-unit SLA rows')
assertIncludes(queries, 'unsignedVoExposureCents: number', 'unsigned VO exposure')
assertIncludes(queries, 'getProjectCostControl({', 'WO-17 cost-control source of truth')
assertIncludes(queries, 'costVarianceCents: forecastCostCents - baselineCostCents', 'cost variance against approved budget')
assertIncludes(queries, 'marginVarianceBps: forecastMarginBps - baselineMarginBps', 'project margin variance')
assertIncludes(queries, 'eq(projects.tenant_id, tenantId)', 'tenant-scoped projects')
assertIncludes(queries, 'eq(variationOrders.tenant_id, tenantId)', 'tenant-scoped variation orders')
assertIncludes(queries, 'eq(permits.tenant_id, tenantId)', 'tenant-scoped permits')
assertIncludes(queries, 'eq(slaClocks.tenant_id, tenantId)', 'tenant-scoped SLA clocks')
assertIncludes(queries, 'gte(opportunities.closing_date, fiscalYearStart)', 'FYTD lower bound')
assertIncludes(queries, 'lte(opportunities.closing_date, now)', 'FYTD upper bound')

const page = read('apps/web/src/app/(dashboard)/dashboard/page.tsx')
assertIncludes(page, "getManagementDashboard(profile.tenantId)", 'dashboard management query')
assertIncludes(page, 'return { kpis, stages, reps, alerts, conversionRates, forecast, today, management }', 'management data in executive payload')
assertIncludes(page, '<ManagementHealth data={management} />', 'management health presentation')
assertNotMatches(page, /getManagementDashboard\([^)]*profile\.user\.id/, 'management query widened to user identity')

const kpis = read('apps/web/src/components/dashboard/kpi-cards.tsx')
for (const label of [
  'Active Pipeline TCV',
  'Active GP',
  'Weighted Pipeline',
  'Closed Won FYTD',
  'blended margin',
]) {
  assertIncludes(kpis, label, `existing KPI selection: ${label}`)
}

const health = read('apps/web/src/components/dashboard/management-health.tsx')
for (const label of [
  'Project margin &amp; exposure',
  'Margin Delta',
  'Cost variance',
  'Permit exposure',
  'Unsigned VO',
  'SLA breaches by business unit',
]) {
  assertIncludes(health, label, `management health presentation: ${label}`)
}
assertIncludes(health, 'posted supplier-bill actuals', 'truthful posted actual wording')
assertIncludes(health, 'included in posted cost actuals until', 'unsigned VO separation')
assertNotMatches(queries, /\bscope_items\b|\bscope_item_id\b/i, 'forbidden scope grain')

console.log('WO-18 management dashboard metrics, FYTD closed-won bound, execution-health signals, and tenant invariants passed')
