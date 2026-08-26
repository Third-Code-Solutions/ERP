import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  findE2EPrefixViolations,
  scanMigrationDirectory,
  scanMigrationSource,
} from './lib/build-ops-invariants.mjs'

test('fails floating point and unscaled numeric monetary columns', () => {
  const source = `
    create table public.bad_money (
      tenant_id uuid not null,
      total_cost numeric,
      unit_rate real,
      price_amount double precision
    );
  `
  const violations = scanMigrationSource(source, 'bad-money.sql')
  assert.deepEqual(
    violations.map(({ rule, column }) => ({ rule, column })),
    [
      { rule: 'money-precision', column: 'total_cost' },
      { rule: 'money-precision', column: 'unit_rate' },
      { rule: 'money-precision', column: 'price_amount' },
    ]
  )
})

test('fails a tenant-scoped table without tenant_id not null', () => {
  const violations = scanMigrationSource(
    'create table public.bad_tenant (id uuid primary key);',
    'bad-tenant.sql'
  )
  assert.deepEqual(violations.map(({ rule }) => rule), ['tenant-id-not-null'])
})

test('ignores comments and literals while allowing bigint and scaled numeric', () => {
  const source = `
    -- create table public.fake (total_cost real);
    create table public.good (
      tenant_id uuid not null,
      total_cost_centavos bigint not null,
      tax_rate numeric(18, 4),
      note text default 'create table fake (price real)'
    );
  `
  assert.deepEqual(scanMigrationSource(source, 'good.sql'), [])
})

test('flags E2E-prefixed values only for non-demo tenants', () => {
  const rows = [
    { tenantId: 'demo', table: 'projects', values: { name: 'E2E_demo' } },
    { tenantId: 'prod', table: 'projects', values: { name: 'E2E_leak' } },
    { tenantId: 'prod', table: 'vendors', values: { note: 'normal' } },
  ]
  assert.deepEqual(findE2EPrefixViolations(rows, ['demo']), [
    {
      rule: 'e2e-prefix-non-demo',
      table: 'projects',
      column: 'name',
      tenantId: 'prod',
    },
  ])
})

test('scans a migration directory deterministically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'build-ops-invariants-'))
  try {
    await writeFile(
      join(directory, '002-bad.sql'),
      'create table public.bad (tenant_id uuid, total_value numeric);'
    )
    await writeFile(
      join(directory, '001-good.sql'),
      'create table public.good (tenant_id uuid not null, value_cents bigint);'
    )
    const violations = scanMigrationDirectory(directory)
    assert.equal(violations.length, 2)
    assert.equal(violations[0].file.endsWith('002-bad.sql'), true)
    assert.equal(violations[1].rule, 'money-precision')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('executable gate fails on a bad fixture and passes after removal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'build-ops-gate-'))
  const listPath = join(directory, 'changed-migrations.txt')
  const migrationPath = join(directory, 'fixture.sql')
  const gatePath = resolve('scripts/verify-build-ops-invariants.mjs')

  try {
    await writeFile(
      migrationPath,
      'create table public.bad_fixture (tenant_id uuid not null, total_cost real);'
    )
    await writeFile(listPath, `${migrationPath}\n`)
    const failed = spawnSync(
      process.execPath,
      [gatePath, '--files-list', listPath],
      { encoding: 'utf8' }
    )
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /money-precision/)

    await writeFile(
      migrationPath,
      'create table public.good_fixture (tenant_id uuid not null, total_cost_centavos bigint);'
    )
    const passed = spawnSync(
      process.execPath,
      [gatePath, '--files-list', listPath],
      { encoding: 'utf8' }
    )
    assert.equal(passed.status, 0)
    assert.match(passed.stdout, /BUILD OPS static invariants: PASS/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

const approvedPlatformGlobalMigration = `
  create table public.platform_demo_requests (
    id uuid primary key
  );
  alter table public.platform_demo_requests enable row level security;
  alter table public.platform_demo_requests force row level security;
  revoke all privileges on table public.platform_demo_requests
    from public, anon, authenticated;

  create table public.platform_audit_log (
    id uuid primary key
  );
  create function public.reject_platform_audit_mutation()
  returns trigger
  language plpgsql
  as $$
  begin
    raise exception 'platform audit evidence is append-only';
  end;
  $$;
  create trigger platform_audit_log_no_mutation
    before update or delete on public.platform_audit_log
    for each row execute function public.reject_platform_audit_mutation();
  alter table public.platform_audit_log enable row level security;
  alter table public.platform_audit_log force row level security;
  revoke all privileges on table public.platform_audit_log
    from public, anon, authenticated;
`

function assertContainsViolation(violations, expected) {
  assert.equal(
    violations.some((violation) =>
      Object.entries(expected).every(
        ([key, value]) => violation[key] === value
      )
    ),
    true,
    `Expected violation ${JSON.stringify(expected)}, received ${JSON.stringify(violations)}`
  )
}

test('accepts only ADR-028 platform-global tables with every required safeguard', async () => {
  assert.deepEqual(
    scanMigrationSource(approvedPlatformGlobalMigration, 'approved-platform-global.sql'),
    []
  )

  const ownerMigration = await readFile(
    resolve('supabase/migrations/20260825190000_owner_console_and_demo_intake.sql'),
    'utf8'
  )
  assert.deepEqual(
    scanMigrationSource(ownerMigration, 'owner-console-and-demo-intake.sql'),
    []
  )
})

test('rejects an unapproved tenantless table even when it copies global safeguards', () => {
  const source = approvedPlatformGlobalMigration.replaceAll(
    'platform_demo_requests',
    'unapproved_platform_records'
  )
  const violations = scanMigrationSource(source, 'unapproved-global.sql')

  assertContainsViolation(violations, {
    rule: 'tenant-id-not-null',
    table: 'unapproved_platform_records',
  })
})

test('rejects approved global tables when FORCE RLS is absent', () => {
  const source = approvedPlatformGlobalMigration.replace(
    'alter table public.platform_demo_requests force row level security;\n',
    ''
  )

  assertContainsViolation(
    scanMigrationSource(source, 'global-missing-force-rls.sql'),
    {
      rule: 'platform-global-force-rls',
      table: 'platform_demo_requests',
    }
  )
})

test('rejects approved global tables when a client role receives a direct grant or policy', () => {
  const withGrant = `${approvedPlatformGlobalMigration}
    grant select on table public.platform_demo_requests to authenticated;
  `
  const withPolicy = `${approvedPlatformGlobalMigration}
    create policy exposed_platform_audit
      on public.platform_audit_log
      for select
      using (true);
  `

  assertContainsViolation(
    scanMigrationSource(withGrant, 'global-client-grant.sql'),
    {
      rule: 'platform-global-client-access',
      table: 'platform_demo_requests',
    }
  )
  assertContainsViolation(
    scanMigrationSource(withPolicy, 'global-client-policy.sql'),
    {
      rule: 'platform-global-client-access',
      table: 'platform_audit_log',
    }
  )
})

test('rejects later standalone client grants and policies on approved global tables', () => {
  const laterGrant = `
    grant select on table public.platform_demo_requests to authenticated;
  `
  const laterPolicy = `
    create policy exposed_platform_audit
      on public.platform_audit_log
      for select
      using (true);
  `

  assertContainsViolation(
    scanMigrationSource(laterGrant, 'later-global-client-grant.sql'),
    {
      rule: 'platform-global-client-access',
      table: 'platform_demo_requests',
    }
  )
  assertContainsViolation(
    scanMigrationSource(laterPolicy, 'later-global-client-policy.sql'),
    {
      rule: 'platform-global-client-access',
      table: 'platform_audit_log',
    }
  )
})

test('rejects later standalone RLS weakening on approved global tables', () => {
  const noForce = `
    alter table public.platform_demo_requests no force row level security;
  `
  const disableRls = `
    alter table if exists public.platform_audit_log disable row level security;
  `
  const onlyNoForce = `
    alter table only public.platform_demo_requests no force row level security;
  `

  assertContainsViolation(
    scanMigrationSource(noForce, 'later-global-no-force.sql'),
    {
      rule: 'platform-global-force-rls',
      table: 'platform_demo_requests',
    }
  )
  assertContainsViolation(
    scanMigrationSource(disableRls, 'later-global-disable-rls.sql'),
    {
      rule: 'platform-global-force-rls',
      table: 'platform_audit_log',
    }
  )
  assertContainsViolation(
    scanMigrationSource(onlyNoForce, 'later-global-only-no-force.sql'),
    {
      rule: 'platform-global-force-rls',
      table: 'platform_demo_requests',
    }
  )
})

test('allows a platform-global service-role-only policy', () => {
  const source = `${approvedPlatformGlobalMigration}
    create policy service_role_platform_audit
      on public.platform_audit_log
      for select
      to service_role
      using (true);
  `

  assert.deepEqual(
    scanMigrationSource(source, 'global-service-role-policy.sql'),
    []
  )
})

test('rejects platform audit tables without a rejecting update-delete trigger', () => {
  const source = approvedPlatformGlobalMigration.replace(
    /create trigger platform_audit_log_no_mutation[\s\S]*?execute function public\.reject_platform_audit_mutation\(\);/,
    ''
  )

  assertContainsViolation(
    scanMigrationSource(source, 'global-mutable-audit.sql'),
    {
      rule: 'platform-global-audit-append-only',
      table: 'platform_audit_log',
    }
  )
})

test('CI runs the full PR suite and keeps migration checks ahead of CI-only grants', async () => {
  const workflow = await readFile(resolve('.github/workflows/ci.yml'), 'utf8')
  const productionWorkflow = await readFile(
    resolve('.github/workflows/deploy-production.yml'),
    'utf8'
  )
  const apiDockerfile = await readFile(resolve('apps/api/Dockerfile'), 'utf8')
  const rootPackage = await readFile(resolve('package.json'), 'utf8')

  assert.match(workflow, /pull_request:\s*\n\s+branches: \[main\]/)
  assert.match(workflow, /- run: pnpm test/)
  assert.doesNotMatch(workflow, /- run: pnpm turbo test/)
  assert.match(rootPackage, /"test": "turbo test --concurrency=1"/)
  assert.match(workflow, /build-ops-invariants:\s*\n\s+name: BUILD OPS Invariants/)
  assert.match(workflow, /run: pnpm test:build-ops-invariants/)
  assert.match(
    workflow,
    /node scripts\/verify-build-ops-invariants\.mjs --files-list tmp\/build-ops\/changed-migrations\.txt/
  )
  assert.match(workflow, /BUILD_OPS_DEMO_TENANT_SLUGS: abi-ops-local/)
  assert.match(workflow, /run: pnpm verify:build-ops-data/)
  assert.match(
    rootPackage,
    /"test:database-repro-policy-contract": "node --test scripts\/verify-database-repro-policy-contract\.test\.mjs"/
  )
  assert.match(workflow, /run: pnpm test:database-repro-policy-contract/)
  assert.match(
    productionWorkflow,
    /pnpm test:database-repro-policy-contract/
  )
  assert.match(
    apiDockerfile,
    /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml turbo\.json \.npmrc \.\//
  )
  assert.match(
    apiDockerfile,
    /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.npmrc \.\//
  )
  assert.match(workflow, /GITHUB_EVENT_BEFORE:-/)
  assert.match(
    workflow,
    /Rebuild database from zero[\s\S]*?Verify migration ledger and catalog[\s\S]*?Capture and assert empty schema diff[\s\S]*?Apply CI-only legacy Data API grants/
  )
  assert.match(
    workflow,
    /database-reproducibility:\s*\n[\s\S]*?needs: \[actionlint, build-ops-invariants\]/
  )
  assert.match(
    workflow,
    /build:\s*\n[\s\S]*?needs: \[typecheck, lint, test, build-ops-invariants, database-reproducibility\]/
  )
})
