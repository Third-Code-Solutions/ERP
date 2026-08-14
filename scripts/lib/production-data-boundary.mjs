const TEST_EMAIL_SUFFIXES = ['@abi-ops.test', '@buildops.local']

export function parseList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function tenantKey(value) {
  return value == null ? '' : String(value)
}

function isTestIdentity({ email, fullName }) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  const normalizedName = String(fullName ?? '').trim()
  const hasTestEmailSuffix = TEST_EMAIL_SUFFIXES.some((suffix) =>
    normalizedEmail.endsWith(suffix),
  )
  const hasTestEmailPrefix = /^(?:e2e|test)(?:[_+.-]|$)/i.test(normalizedEmail)
  const hasSeededNamePrefix = /^(?:e2e|demo)(?:[_\s-]|$)/i.test(normalizedName)

  return {
    email: hasTestEmailSuffix || hasTestEmailPrefix,
    name: hasSeededNamePrefix,
  }
}

function isAllowedTenant(match, allowedTenantIds, allowedTenantSlugs) {
  return (
    allowedTenantIds.has(tenantKey(match.tenant_id ?? match.tenantId)) ||
    allowedTenantSlugs.has(tenantKey(match.tenant_slug ?? match.tenantSlug))
  )
}

function violationTenant(match) {
  return {
    tenant_id: tenantKey(match.tenant_id ?? match.tenantId) || null,
    tenant_slug: tenantKey(match.tenant_slug ?? match.tenantSlug) || 'unknown',
  }
}

/**
 * Pure promotion decision. It intentionally returns metadata only; matching
 * values are never included so a CI artifact cannot become a data leak.
 */
export function evaluateProductionDataBoundary(
  { e2eFieldMatches = [], identityRows = [] },
  { demoTenantIds = [], demoTenantSlugs = [] } = {},
) {
  const allowedTenantIds = new Set(demoTenantIds.map(tenantKey).filter(Boolean))
  const allowedTenantSlugs = new Set(
    demoTenantSlugs.map(tenantKey).filter(Boolean),
  )
  const violations = []

  for (const match of e2eFieldMatches) {
    if (isAllowedTenant(match, allowedTenantIds, allowedTenantSlugs)) continue
    violations.push({
      rule: 'e2e-prefix-non-demo',
      ...violationTenant(match),
      table: match.table,
      column: match.column,
      row_id: match.row_id ?? null,
    })
  }

  for (const row of identityRows) {
    const markers = isTestIdentity(row)
    if (!markers.email && !markers.name) continue
    if (isAllowedTenant(row, allowedTenantIds, allowedTenantSlugs)) continue
    violations.push({
      rule: 'seeded-test-identity-non-demo',
      marker: markers.email && markers.name ? 'email+name' : markers.email ? 'email' : 'name',
      ...violationTenant(row),
      table: 'users',
      column: markers.email ? 'email' : 'full_name',
      row_id: row.row_id ?? row.id ?? null,
    })
  }

  violations.sort((left, right) =>
    [left.tenant_slug, left.table, left.column, left.row_id ?? '']
      .join('\u0000')
      .localeCompare(
        [right.tenant_slug, right.table, right.column, right.row_id ?? '']
          .join('\u0000'),
      ),
  )

  return {
    status: violations.length === 0 ? 'clear' : 'review_required',
    violation_count: violations.length,
    violations,
  }
}

export function resolveAllowedTenants(
  tenants,
  { demoTenantIds = [], demoTenantSlugs = [] } = {},
) {
  const tenantIds = new Set(tenants.map((tenant) => tenantKey(tenant.id)))
  const tenantSlugs = new Set(tenants.map((tenant) => tenantKey(tenant.slug)))
  const missingIds = demoTenantIds.filter((id) => !tenantIds.has(tenantKey(id)))
  const missingSlugs = demoTenantSlugs.filter(
    (slug) => !tenantSlugs.has(tenantKey(slug)),
  )
  if (missingIds.length || missingSlugs.length) {
    throw new Error(
      [
        missingIds.length ? `tenant id(s) not found: ${missingIds.join(', ')}` : '',
        missingSlugs.length
          ? `tenant slug(s) not found: ${missingSlugs.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    )
  }

  return tenants
    .filter(
      (tenant) =>
        demoTenantIds.includes(tenantKey(tenant.id)) ||
        demoTenantSlugs.includes(tenantKey(tenant.slug)),
    )
    .map(({ id, slug }) => ({ id: tenantKey(id), slug: tenantKey(slug) }))
}
