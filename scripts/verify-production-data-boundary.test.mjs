import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  evaluateProductionDataBoundary,
  resolveAllowedTenants,
} from './lib/production-data-boundary.mjs'

test('allows only exact dedicated demo tenants', () => {
  const report = evaluateProductionDataBoundary(
    {
      e2eFieldMatches: [
        { tenant_id: 'demo', tenant_slug: 'buildops-e2e', table: 'projects', column: 'name' },
        { tenant_id: 'prod', tenant_slug: 'customer-co', table: 'projects', column: 'name' },
      ],
      identityRows: [
        { row_id: 'demo-user', tenant_id: 'demo', tenant_slug: 'buildops-e2e', email: 'admin@abi-ops.test', full_name: 'Demo Admin' },
        { row_id: 'prod-user', tenant_id: 'prod', tenant_slug: 'customer-co', email: 'test@buildops.local', full_name: 'E2E Test User' },
      ],
    },
    { demoTenantSlugs: ['buildops-e2e'] },
  )

  assert.equal(report.status, 'review_required')
  assert.equal(report.violation_count, 2)
  assert.deepEqual(
    report.violations.map(({ rule, tenant_slug, table, column }) => ({ rule, tenant_slug, table, column })),
    [
      { rule: 'e2e-prefix-non-demo', tenant_slug: 'customer-co', table: 'projects', column: 'name' },
      { rule: 'seeded-test-identity-non-demo', tenant_slug: 'customer-co', table: 'users', column: 'email' },
    ],
  )
})

test('returns clear for a clean customer tenant', () => {
  const report = evaluateProductionDataBoundary(
    {
      e2eFieldMatches: [],
      identityRows: [
        { row_id: 'customer-user', tenant_id: 'customer', tenant_slug: 'customer-co', email: 'owner@customer.co', full_name: 'Customer Owner' },
      ],
    },
    { demoTenantSlugs: ['buildops-e2e'] },
  )
  assert.equal(report.status, 'clear')
  assert.equal(report.violation_count, 0)
})

test('fails configuration when an allowlisted tenant is absent', () => {
  assert.throws(
    () => resolveAllowedTenants([{ id: 'demo', slug: 'buildops-e2e' }], { demoTenantSlugs: ['missing-demo'] }),
    /tenant slug\(s\) not found: missing-demo/,
  )
})

test('production promotion workflow requires the read-only boundary gate before deploy', async () => {
  const workflow = await readFile(resolve('.github/workflows/deploy-production.yml'), 'utf8')
  assert.match(workflow, /PRODUCTION_DATABASE_URL: \$\{\{ secrets\.PRODUCTION_DATABASE_URL \}\}/)
  assert.match(workflow, /node scripts\/verify-production-data-boundary\.mjs --require-clear/)
  assert.match(
    workflow,
    /verify-production-data-boundary\.mjs --require-clear[\s\S]*?Deploy Nest API to exact Railway service/,
  )
})

test('role-account seeding is mutation-confirmed', async () => {
  const source = await readFile(resolve('scripts/seed-role-accounts.mjs'), 'utf8')
  assert.match(source, /--apply/)
  assert.match(source, /DEMO_SEED_ALLOW_MUTATION/)
  assert.match(source, /Refusing to mutate demo accounts/)
})
