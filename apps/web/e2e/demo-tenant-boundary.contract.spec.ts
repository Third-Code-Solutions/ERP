import { expect, test } from './base-test'
import {
  assertProductionDemoBoundary,
  DEMO_ROLE_EMAILS,
  ISOLATION_PROJECT_CLIENT,
  ISOLATION_PROJECT_NAME,
  ISOLATION_TENANT_SLUG,
  resolveForeignProjectId,
} from './helpers/production-demo-boundary'
import { authenticateRole } from './helpers/supabase-magic-link'

const TENANT_ID = 'fdd60ae0-9819-4564-8626-3f5571d2dca1'
const FOREIGN_TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function fixtureFetch(options: { foreignRole?: string; foreignProject?: boolean; missingRole?: string; inactiveRole?: string } = {}): typeof fetch {
  return async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/tenants')) {
      return Response.json([{ id: TENANT_ID, slug: 'buildops-e2e' }])
    }
    if (url.pathname.endsWith('/users')) {
      const role = url.searchParams.get('role')?.replace('eq.', '')
      if (role === options.missingRole) return Response.json([])
      const email = role && DEMO_ROLE_EMAILS[role as keyof typeof DEMO_ROLE_EMAILS]
      return Response.json([{
        email,
        tenant_id: role === options.foreignRole ? FOREIGN_TENANT_ID : TENANT_ID,
        account_status: role === options.inactiveRole ? 'suspended' : 'active',
      }])
    }
    if (url.pathname.endsWith('/projects')) {
      return Response.json([{ id: PROJECT_ID, tenant_id: options.foreignProject ? FOREIGN_TENANT_ID : TENANT_ID, deleted_at: null }])
    }
    throw new Error('Unexpected fixture request')
  }
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon-key'
  process.env.E2E_DEMO_TENANT_SLUG = 'buildops-e2e'
  process.env.E2E_PROJECT_ID = PROJECT_ID
})

test.afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.E2E_DEMO_TENANT_SLUG
  delete process.env.E2E_PROJECT_ID
})

test('accepts all fixed profiles and project in the exact demo tenant', async () => {
  await expect(assertProductionDemoBoundary(fixtureFetch())).resolves.toBeUndefined()
})

test('rejects a role profile in another tenant', async () => {
  await expect(assertProductionDemoBoundary(fixtureFetch({ foreignRole: 'finance' })))
    .rejects.toThrow('finance demo profile is outside the dedicated demo tenant')
})

test('rejects a missing role profile', async () => {
  await expect(assertProductionDemoBoundary(fixtureFetch({ missingRole: 'viewer' })))
    .rejects.toThrow('Expected exactly one viewer demo profile')
})

test('rejects an inactive role profile', async () => {
  await expect(assertProductionDemoBoundary(fixtureFetch({ inactiveRole: 'viewer' })))
    .rejects.toThrow('viewer demo profile is not active')
})

test('rejects a project in another tenant', async () => {
  await expect(assertProductionDemoBoundary(fixtureFetch({ foreignProject: true })))
    .rejects.toThrow('Demo project is outside the dedicated demo tenant')
})

test('selects only the dedicated synthetic isolation project through service-role read', async () => {
  const foreignFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    expect(init?.method).toBeUndefined()
    expect(init?.headers).toMatchObject({ apikey: 'fixture-service-key' })
    if (url.pathname === '/rest/v1/tenants') {
      expect(url.searchParams.get('slug')).toBe(`eq.${ISOLATION_TENANT_SLUG}`)
      return Response.json([{ id: FOREIGN_TENANT_ID, slug: ISOLATION_TENANT_SLUG }])
    }
    expect(url.pathname).toBe('/rest/v1/projects')
    expect(url.searchParams.get('tenant_id')).toBe(`eq.${FOREIGN_TENANT_ID}`)
    expect(url.searchParams.get('name')).toBe(`eq.${ISOLATION_PROJECT_NAME}`)
    expect(url.searchParams.get('deleted_at')).toBe('is.null')
    return Response.json([{
      id: PROJECT_ID,
      tenant_id: FOREIGN_TENANT_ID,
      deleted_at: null,
      name: ISOLATION_PROJECT_NAME,
      client: ISOLATION_PROJECT_CLIENT,
      status: 'active',
    }])
  }
  await expect(resolveForeignProjectId(TENANT_ID, foreignFetch)).resolves.toBe(PROJECT_ID)
})

test('fails closed when the synthetic isolation tenant is absent', async () => {
  await expect(resolveForeignProjectId(TENANT_ID, async () => Response.json([])))
    .rejects.toThrow('No safe synthetic isolation tenant is available')
})

test('fails closed when the synthetic project is absent', async () => {
  const foreignFetch: typeof fetch = async (input) => {
    const url = new URL(String(input))
    return url.pathname === '/rest/v1/tenants'
      ? Response.json([{ id: FOREIGN_TENANT_ID, slug: ISOLATION_TENANT_SLUG }])
      : Response.json([])
  }
  await expect(resolveForeignProjectId(TENANT_ID, foreignFetch))
    .rejects.toThrow('No safe active foreign project fixture is available')
})

test('rejects a same-tenant, deleted, or mislabeled isolation fixture', async () => {
  for (const row of [
    { id: PROJECT_ID, tenant_id: TENANT_ID, deleted_at: null, name: ISOLATION_PROJECT_NAME, client: ISOLATION_PROJECT_CLIENT, status: 'active' },
    { id: PROJECT_ID, tenant_id: FOREIGN_TENANT_ID, deleted_at: '2026-01-01T00:00:00Z', name: ISOLATION_PROJECT_NAME, client: ISOLATION_PROJECT_CLIENT, status: 'active' },
    { id: PROJECT_ID, tenant_id: FOREIGN_TENANT_ID, deleted_at: null, name: 'Customer project', client: ISOLATION_PROJECT_CLIENT, status: 'active' },
  ]) {
    const foreignFetch: typeof fetch = async (input) => {
      const url = new URL(String(input))
      return url.pathname === '/rest/v1/tenants'
        ? Response.json([{ id: FOREIGN_TENANT_ID, slug: ISOLATION_TENANT_SLUG }])
        : Response.json([row])
    }
    await expect(resolveForeignProjectId(TENANT_ID, foreignFetch))
      .rejects.toThrow('No safe active foreign project fixture is available')
  }
})

test('requires both protected production fixture selectors', async () => {
  delete process.env.E2E_DEMO_TENANT_SLUG
  await expect(assertProductionDemoBoundary(fixtureFetch()))
    .rejects.toThrow('Production E2E requires E2E_DEMO_TENANT_SLUG and E2E_PROJECT_ID')
})

test('rejects a foreign role profile before generating a magic link', async () => {
  const originalFetch = globalThis.fetch
  let generatedLink = false
  const fixture = fixtureFetch({ foreignRole: 'finance' })
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/admin/generate_link')) {
      generatedLink = true
      throw new Error('Magic link generation must not be reached')
    }
    return fixture(input, init)
  }
  try {
    await expect(authenticateRole({ addCookies: async () => {} }, 'https://demo.example', 'finance'))
      .rejects.toThrow('finance demo profile is outside the dedicated demo tenant')
    expect(generatedLink).toBe(false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects an inactive role profile before generating a magic link', async () => {
  const originalFetch = globalThis.fetch
  let generatedLink = false
  const fixture = fixtureFetch({ inactiveRole: 'finance' })
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/admin/generate_link')) {
      generatedLink = true
      throw new Error('Magic link generation must not be reached')
    }
    return fixture(input, init)
  }
  try {
    await expect(authenticateRole({ addCookies: async () => {} }, 'https://demo.example', 'finance'))
      .rejects.toThrow('finance demo profile is not active')
    expect(generatedLink).toBe(false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
