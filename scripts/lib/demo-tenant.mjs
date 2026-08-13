export const DEFAULT_DEMO_TENANT_SLUG = 'buildops-e2e'

const safeDemoSlugPattern = /(?:demo|e2e|test|local)/i

export function getConfiguredDemoTenantSlug(environment = process.env) {
  const slug = (
    environment.DEMO_TENANT_SLUG ?? DEFAULT_DEMO_TENANT_SLUG
  ).trim()

  if (!slug || !safeDemoSlugPattern.test(slug)) {
    throw new Error(
      'DEMO_TENANT_SLUG must identify a dedicated demo, E2E, test, or local tenant'
    )
  }

  return slug
}

export function selectDemoTenant(rows, slug = getConfiguredDemoTenantSlug()) {
  const safeSlug = getConfiguredDemoTenantSlug({ DEMO_TENANT_SLUG: slug })
  const tenant = rows.find((row) => row.slug === safeSlug)
  if (!tenant) {
    throw new Error(`Dedicated demo tenant not found: ${safeSlug}`)
  }
  return tenant
}
