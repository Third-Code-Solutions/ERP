#!/usr/bin/env node

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  evaluateProductionDataBoundary,
  parseList,
  resolveAllowedTenants,
} from './lib/production-data-boundary.mjs'

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
)
const scriptPath = fileURLToPath(import.meta.url)

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function parseArguments(argv) {
  const args = { json: false, requireClear: false }
  for (const argument of argv) {
    if (argument === '--json') args.json = true
    else if (argument === '--require-clear') args.requireClear = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

function resolveDatabaseUrl(environment, requireProductionUrl) {
  const databaseUrl = requireProductionUrl
    ? environment.PRODUCTION_DATABASE_URL
    : environment.PRODUCTION_DATABASE_URL ?? environment.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      requireProductionUrl
        ? 'PRODUCTION_DATABASE_URL is required for the production boundary gate'
        : 'DATABASE_URL or PRODUCTION_DATABASE_URL is required',
    )
  }
  return databaseUrl
}

async function scanDatabase({ databaseUrl, demoTenantIds, demoTenantSlugs }) {
  const postgres = requireFromDatabasePackage('postgres')
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    prepare: !databaseUrl.includes(':6543') && !databaseUrl.includes('pgbouncer=true'),
  })

  try {
    const tenants = await sql`
      select id::text as id, slug
      from public.tenants
      order by slug, id
    `
    const allowedTenants = resolveAllowedTenants(tenants, {
      demoTenantIds,
      demoTenantSlugs,
    })
    const allowedIds = new Set(allowedTenants.map((tenant) => tenant.id))
    const allowedSlugs = new Set(allowedTenants.map((tenant) => tenant.slug))
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))

    const columns = await sql`
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name <> 'tenant_id'
        and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
        and exists (
          select 1
          from information_schema.columns tc
          where tc.table_schema = c.table_schema
            and tc.table_name = c.table_name
            and tc.column_name = 'tenant_id'
        )
      order by c.table_name, c.ordinal_position
    `
    const idColumns = await sql`
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'id'
    `
    const tablesWithId = new Set(idColumns.map((row) => row.table_name))
    const groupedColumns = new Map()
    for (const column of columns) {
      const tableColumns = groupedColumns.get(column.table_name) ?? []
      tableColumns.push(column.column_name)
      groupedColumns.set(column.table_name, tableColumns)
    }

    const e2eFieldMatches = []
    for (const [table, tableColumns] of groupedColumns) {
      const predicates = tableColumns
        .map((column) => `${quoteIdentifier(column)}::text like 'E2E\\_%' escape '\\'`)
        .join(' or ')
      const idSelect = tablesWithId.has(table)
        ? 'id::text as row_id'
        : 'null::text as row_id'
      const valueSelect = tableColumns
        .map((column) => `${quoteIdentifier(column)}::text as ${quoteIdentifier(column)}`)
        .join(', ')
      const rows = await sql.unsafe(
        `select ${idSelect}, tenant_id::text as tenant_id, ${valueSelect}
           from public.${quoteIdentifier(table)}
          where ${predicates}`,
      )
      for (const row of rows) {
        const tenant = tenantById.get(row.tenant_id)
        for (const column of tableColumns) {
          const value = row[column]
          if (typeof value === 'string' && value.startsWith('E2E_')) {
            e2eFieldMatches.push({
              tenant_id: row.tenant_id,
              tenant_slug: tenant?.slug ?? 'unknown',
              table,
              row_id: row.row_id,
              column,
            })
          }
        }
      }
    }

    const userColumnRows = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name in ('id', 'tenant_id', 'email', 'full_name')
    `
    const userColumns = new Set(userColumnRows.map((row) => row.column_name))
    if (!['id', 'tenant_id', 'email', 'full_name'].every((column) => userColumns.has(column))) {
      throw new Error(
        'public.users must expose id, tenant_id, email, and full_name for the production identity boundary gate',
      )
    }
    const userRows = await sql`
      select u.id::text as row_id,
             u.tenant_id::text as tenant_id,
             t.slug as tenant_slug,
             u.email,
             u.full_name
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      where u.email is not null or u.full_name is not null
      order by t.slug, u.email, u.id
    `

    const decision = evaluateProductionDataBoundary(
      { e2eFieldMatches, identityRows: userRows },
      { demoTenantIds: [...allowedIds], demoTenantSlugs: [...allowedSlugs] },
    )
    return {
      read_only: true,
      status: decision.status,
      allowed_demo_tenants: allowedTenants,
      tenant_count: tenants.length,
      e2e_field_match_count: e2eFieldMatches.length,
      seeded_identity_match_count: decision.violations.filter(
        (violation) => violation.rule === 'seeded-test-identity-non-demo',
      ).length,
      violation_count: decision.violation_count,
      violations: decision.violations,
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const args = parseArguments(argv)
  const demoTenantIds = parseList(environment.BUILD_OPS_DEMO_TENANT_IDS)
  const demoTenantSlugs = parseList(environment.BUILD_OPS_DEMO_TENANT_SLUGS)
  if (demoTenantIds.length === 0 && demoTenantSlugs.length === 0) {
    throw new Error(
      'Set BUILD_OPS_DEMO_TENANT_IDS or BUILD_OPS_DEMO_TENANT_SLUGS before the production boundary scan',
    )
  }
  const report = await scanDatabase({
    databaseUrl: resolveDatabaseUrl(environment, args.requireClear),
    demoTenantIds,
    demoTenantSlugs,
  })

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Production data boundary: ${report.status}`)
    console.log(`Read-only tenant scan: ${report.tenant_count} tenants`)
    console.log(`E2E field matches: ${report.e2e_field_match_count}`)
    console.log(`Seeded test identities outside allowlist: ${report.seeded_identity_match_count}`)
    console.log(`Promotion violations: ${report.violation_count}`)
    for (const violation of report.violations) {
      console.log(
        `- ${violation.rule} tenant=${violation.tenant_slug} table=${violation.table} ` +
          `column=${violation.column} row=${violation.row_id ?? 'unknown'}`,
      )
    }
  }

  return report.status === 'clear'
}

export { scanDatabase }

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main()
    .then((passed) => {
      if (process.argv.includes('--require-clear') && !passed) process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
