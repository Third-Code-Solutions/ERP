#!/usr/bin/env node

/**
 * Removes the two historically verified E2E tenants from production only after
 * an explicit operator confirmation. It is deliberately unavailable to
 * application code: this is a release-operator recovery tool, not a tenant
 * management endpoint.
 */
import { createRequire } from 'node:module'

const EXPECTED_E2E_TENANT_SLUGS = Object.freeze([
  'buildops-e2e',
  'e2e-qa-20260513-foreign',
])
const CONFIRMATION_VALUE = 'PURGE_E2E_PRODUCTION_DATA'
const DOCUMENTS_BUCKET = 'documents'
const DELETE_BATCH_SIZE = 100

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
)
const requireFromApiPackage = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
)

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function parseArguments(argv) {
  const args = { apply: false, json: false }
  for (const argument of argv) {
    if (argument === '--apply') args.apply = true
    else if (argument === '--json') args.json = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

function requireEnvironment(environment, name) {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertConfirmation(environment) {
  if (environment.PURGE_PRODUCTION_E2E_CONFIRMATION !== CONFIRMATION_VALUE) {
    throw new Error(
      `Set PURGE_PRODUCTION_E2E_CONFIRMATION=${CONFIRMATION_VALUE} to authorize deletion`,
    )
  }
}

function assertExpectedTenants(rows) {
  const expected = new Set(EXPECTED_E2E_TENANT_SLUGS)
  const actual = new Set(rows.map((row) => row.slug))
  if (rows.length !== expected.size || actual.size !== expected.size) {
    throw new Error('The exact historical E2E tenant manifest no longer matches production')
  }
  for (const slug of expected) {
    if (!actual.has(slug)) {
      throw new Error(`Expected E2E tenant is absent: ${slug}`)
    }
  }
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function tenantTableCounts(sql, tenantIds) {
  const columns = await sql`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
    group by table_name
    order by table_name
  `
  const counts = []
  for (const { table_name: tableName } of columns) {
    const [row] = await sql.unsafe(
      `select count(*)::text as row_count
         from public.${quoteIdentifier(tableName)}
        where tenant_id = any($1::uuid[])`,
      [tenantIds],
    )
    counts.push({ table: tableName, row_count: Number(row.row_count) })
  }
  return counts.filter((entry) => entry.row_count > 0)
}

async function listTenantStoragePaths(bucket, tenantId) {
  const paths = []
  async function visit(prefix) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Storage listing failed for ${prefix}: ${error.message}`)
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`
      if (entry.id === null) {
        await visit(path)
      } else {
        paths.push(path)
      }
    }
  }
  await visit(tenantId)
  return paths
}

async function createManifest(sql, storage) {
  const matchingTenants = await sql.unsafe(
    `select id::text as id, slug
       from public.tenants
      where slug = any($1::text[])
      order by slug, id`,
    [EXPECTED_E2E_TENANT_SLUGS],
  )
  assertExpectedTenants(matchingTenants)

  const allTenants = await sql`
    select id::text as id, slug
    from public.tenants
    order by slug, id
  `
  const tenantIds = matchingTenants.map((tenant) => tenant.id)
  const userRows = await sql.unsafe(
    `select id::text as id
       from public.users
      where tenant_id = any($1::uuid[])
      order by id`,
    [tenantIds],
  )
  const storagePathsByTenant = {}
  for (const tenant of matchingTenants) {
    const paths = await listTenantStoragePaths(storage, tenant.id)
    if (paths.some((path) => !path.startsWith(`${tenant.id}/`))) {
      throw new Error(`Storage path escaped exact tenant prefix for ${tenant.slug}`)
    }
    storagePathsByTenant[tenant.slug] = paths
  }

  const tableCounts = await tenantTableCounts(sql, tenantIds)
  return {
    expected_tenant_slugs: EXPECTED_E2E_TENANT_SLUGS,
    tenants: matchingTenants,
    all_tenant_count: allTenants.length,
    only_expected_e2e_tenants:
      allTenants.length === matchingTenants.length &&
      allTenants.every((tenant) => EXPECTED_E2E_TENANT_SLUGS.includes(tenant.slug)),
    public_user_count: userRows.length,
    public_table_counts: tableCounts,
    documents_storage_object_count: Object.values(storagePathsByTenant).reduce(
      (total, paths) => total + paths.length,
      0,
    ),
    // Paths and user IDs are used only in-memory during the apply phase. They
    // are intentionally excluded from the emitted manifest and CI artifacts.
    _tenantIds: tenantIds,
    _userIds: userRows.map((row) => row.id),
    _storagePathsByTenant: storagePathsByTenant,
  }
}

function publicManifest(manifest) {
  const { _tenantIds, _userIds, _storagePathsByTenant, ...report } = manifest
  return report
}

async function deleteStorageObjects(storage, manifest) {
  for (const paths of Object.values(manifest._storagePathsByTenant)) {
    for (const batch of chunk(paths, DELETE_BATCH_SIZE)) {
      if (batch.length === 0) continue
      const { error } = await storage.remove(batch)
      if (error) throw new Error(`Storage deletion failed: ${error.message}`)
    }
  }
}

async function deleteAuthUsers(supabase, userIds) {
  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId)
    // A previous interrupted attempt may already have removed an Auth user
    // before the database transaction was attempted, so retry safely on 404.
    if (error && error.status !== 404) {
      throw new Error(`Auth user deletion failed: ${error.message}`)
    }
  }
}

async function verifyPostPurge(sql, storage, tenantIds) {
  const [tenantRow] = await sql.unsafe(
    `select count(*)::text as row_count
       from public.tenants
      where id = any($1::uuid[])`,
    [tenantIds],
  )
  if (Number(tenantRow.row_count) !== 0) {
    throw new Error('Tenant rows remain after purge')
  }
  const remainingRows = await tenantTableCounts(sql, tenantIds)
  if (remainingRows.length > 0) {
    throw new Error(`Tenant-scoped rows remain after purge: ${remainingRows[0].table}`)
  }
  for (const tenantId of tenantIds) {
    const paths = await listTenantStoragePaths(storage, tenantId)
    if (paths.length > 0) throw new Error('Storage objects remain after purge')
  }
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const args = parseArguments(argv)
  if (args.apply) assertConfirmation(environment)

  const databaseUrl = requireEnvironment(environment, 'PRODUCTION_DATABASE_URL')
  const supabaseUrl = requireEnvironment(environment, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnvironment(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const postgres = requireFromDatabasePackage('postgres')
  const { createClient } = requireFromApiPackage('@supabase/supabase-js')
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    prepare: !databaseUrl.includes(':6543') && !databaseUrl.includes('pgbouncer=true'),
  })
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const storage = supabase.storage.from(DOCUMENTS_BUCKET)

  try {
    const manifest = await createManifest(sql, storage)
    if (!args.apply) return { applied: false, ...publicManifest(manifest) }

    if (!manifest.only_expected_e2e_tenants) {
      throw new Error(
        'Purge backup safety gate requires the live tenant catalog to contain only the exact E2E tenants',
      )
    }
    await deleteStorageObjects(storage, manifest)
    await deleteAuthUsers(supabase, manifest._userIds)
    await sql.begin(async (transaction) => {
      await transaction.unsafe(
        `delete from public.tenants where id = any($1::uuid[])`,
        [manifest._tenantIds],
      )
    })
    await verifyPostPurge(sql, storage, manifest._tenantIds)
    return { applied: true, ...publicManifest(manifest) }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main()
    .then((report) => {
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(`Production E2E purge: ${report.applied ? 'APPLIED' : 'DRY RUN'}`)
        console.log(`Target tenants: ${report.tenants.map((tenant) => tenant.slug).join(', ')}`)
        console.log(`Storage objects: ${report.documents_storage_object_count}`)
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
