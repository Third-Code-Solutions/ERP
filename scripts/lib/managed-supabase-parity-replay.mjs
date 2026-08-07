const LOCAL_DATABASE_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  '[::1]',
  'localhost',
])

export function describeLocalReplayTarget(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    return { ok: false, error: 'DATABASE_URL is required' }
  }

  try {
    const url = new URL(databaseUrl)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      return { ok: false, error: 'DATABASE_URL must use PostgreSQL' }
    }
    if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
      return {
        ok: false,
        error: 'parity replay verification is restricted to localhost',
      }
    }
    return {
      ok: true,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, '') || null,
    }
  } catch {
    return { ok: false, error: 'DATABASE_URL is invalid' }
  }
}

export function analyzeManagedSupabaseParityReplay({
  expectedVersions,
  appliedVersions,
  snapshotAppliedCount,
  snapshotPendingCount,
  postgresMajor,
  duplicatePurchaseOrderGroupCount,
  tenantTablesWithoutRls,
  requiredTables,
  managedSurfaces,
  anonAuthTenantExecute,
  mappingMode,
}) {
  const errors = []
  const expected = [...expectedVersions]
  const applied = [...appliedVersions]

  if (postgresMajor !== 17) errors.push('local replay must use PostgreSQL 17')
  if (mappingMode !== 'synthetic_clone_only') {
    errors.push('mapping mode must explicitly be synthetic_clone_only')
  }
  if (snapshotAppliedCount + snapshotPendingCount !== expected.length) {
    errors.push('snapshot boundary does not cover the source migration ledger')
  }
  if (applied.length !== expected.length) {
    errors.push('local replay migration count does not match source')
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (applied[index] !== expected[index]) {
      errors.push(`local replay migration ${index + 1} must be ${expected[index]}`)
      break
    }
  }
  if (duplicatePurchaseOrderGroupCount !== 0) {
    errors.push('local clone still contains duplicate Purchase Order groups')
  }
  if (tenantTablesWithoutRls !== 0) {
    errors.push('local clone contains tenant tables without RLS')
  }
  for (const [table, present] of Object.entries(requiredTables)) {
    if (present !== true) errors.push(`required table is missing: ${table}`)
  }
  if (anonAuthTenantExecute !== false) {
    errors.push('anon can still execute auth_tenant_id()')
  }

  const remainingReleaseBlockers = [
    'owner-approved Purchase Order mapping is missing',
    'full database and protected API integration gates are not proven by this verifier',
  ]
  for (const [surface, present] of Object.entries(managedSurfaces)) {
    if (present !== true) {
      remainingReleaseBlockers.push(`managed surface is absent: ${surface}`)
    }
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? 'suffix_replay_verified' : 'replay_invalid',
    errors,
    postgresMajor,
    migrationCount: applied.length,
    migrationHead: applied.at(-1) ?? null,
    snapshotAppliedCount,
    replayedSuffixCount: applied.length - snapshotAppliedCount,
    syntheticCloneMapping: mappingMode === 'synthetic_clone_only',
    ownerMappingApproved: false,
    fullManagedParity: false,
    releaseReady: false,
    remainingReleaseBlockers,
  }
}
