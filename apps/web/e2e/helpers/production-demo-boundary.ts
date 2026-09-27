import { z } from 'zod'
import { readE2EEnv } from './env'

export const DEMO_ROLE_EMAILS = {
  admin: 'admin@abi.demo.ph',
  commercial: 'commercial@abi.demo.ph',
  cx: 'cx@abi.demo.ph',
  design: 'design@abi.demo.ph',
  finance: 'finance@abi.demo.ph',
  owner: 'owner@abi.demo.ph',
  procurement: 'procurement@abi.demo.ph',
  safety: 'safety@abi.demo.ph',
  sales: 'sales@abi.demo.ph',
  sd_pm_pe: 'sd@abi.demo.ph',
  viewer: 'viewer@abi.demo.ph',
} as const

export type DemoRole = keyof typeof DEMO_ROLE_EMAILS

type BoundaryClient = {
  supabaseUrl: string
  serviceRoleKey: string
  fetcher: typeof fetch
}

const tenantRow = z.object({ id: z.string().uuid(), slug: z.string() })
const profileRow = z.object({
  email: z.string().email(),
  tenant_id: z.string().uuid(),
  account_status: z.string(),
})
const projectRow = z.object({ id: z.string().uuid(), tenant_id: z.string().uuid(), deleted_at: z.string().nullable() })

function client(fetcher: typeof fetch = fetch): BoundaryClient {
  const env = readE2EEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase E2E environment is incomplete')
  }
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    fetcher,
  }
}

async function selectRows(connection: BoundaryClient, path: string, label: string): Promise<unknown[]> {
  const response = await connection.fetcher(`${connection.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: connection.serviceRoleKey,
      Authorization: `Bearer ${connection.serviceRoleKey}`,
    },
  })
  if (!response.ok) throw new Error(`${label} lookup failed (${response.status})`)
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return an array`)
  return rows
}

export async function resolveDemoTenantId(
  slug: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const expectedSlug = z.string().min(1).parse(slug)
  const rows = await selectRows(
    client(fetcher),
    `tenants?select=id,slug&slug=eq.${encodeURIComponent(expectedSlug)}&limit=2`,
    'Demo tenant'
  )
  const tenant = z.array(tenantRow).parse(rows)
  if (tenant.length !== 1 || tenant[0]?.slug !== expectedSlug) {
    throw new Error('Expected exactly one dedicated demo tenant')
  }
  return tenant[0].id
}

export async function assertDemoRoleProfile(
  role: DemoRole,
  expectedTenantId: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const email = DEMO_ROLE_EMAILS[role]
  const rows = await selectRows(
    client(fetcher),
    `users?select=email,tenant_id,account_status&role=eq.${encodeURIComponent(role)}&email=eq.${encodeURIComponent(email)}&limit=2`,
    'Role profile'
  )
  const profiles = z.array(profileRow).parse(rows)
  if (profiles.length !== 1 || profiles[0]?.email !== email) {
    throw new Error(`Expected exactly one ${role} demo profile`)
  }
  if (profiles[0].tenant_id !== expectedTenantId) {
    throw new Error(`${role} demo profile is outside the dedicated demo tenant`)
  }
  if (profiles[0].account_status !== 'active') {
    throw new Error(`${role} demo profile is not active`)
  }
  return email
}

export async function assertDemoProject(
  projectId: string,
  expectedTenantId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const id = z.string().uuid().parse(projectId)
  const rows = await selectRows(
    client(fetcher),
    `projects?select=id,tenant_id,deleted_at&id=eq.${encodeURIComponent(id)}&limit=2`,
    'Demo project'
  )
  const projects = z.array(projectRow).parse(rows)
  if (projects.length !== 1 || projects[0]?.id !== id || projects[0].deleted_at !== null) {
    throw new Error('Expected exactly one active demo project')
  }
  if (projects[0].tenant_id !== expectedTenantId) {
    throw new Error('Demo project is outside the dedicated demo tenant')
  }
}

export async function assertConfiguredDemoProject(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const slug = process.env.E2E_DEMO_TENANT_SLUG
  if (slug === undefined) return
  const tenantId = await resolveDemoTenantId(slug.trim(), fetcher)
  await assertDemoProject(projectId, tenantId, fetcher)
}

export async function resolveForeignProjectId(
  expectedDemoTenantId: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const demoTenantId = z.string().uuid().parse(expectedDemoTenantId)
  const rows = await selectRows(
    client(fetcher),
    `projects?select=id,tenant_id,deleted_at&tenant_id=neq.${encodeURIComponent(demoTenantId)}&deleted_at=is.null&order=id.asc&limit=2`,
    'Foreign project'
  )
  const projects = z.array(projectRow).parse(rows)
  const project = projects[0]
  if (!project || project.tenant_id === demoTenantId || project.deleted_at !== null) {
    throw new Error('No safe active foreign project fixture is available')
  }
  return project.id
}

export async function assertProductionDemoBoundary(fetcher: typeof fetch = fetch): Promise<void> {
  const slug = process.env.E2E_DEMO_TENANT_SLUG?.trim()
  const projectId = process.env.E2E_PROJECT_ID?.trim()
  if (!slug || !projectId) {
    throw new Error('Production E2E requires E2E_DEMO_TENANT_SLUG and E2E_PROJECT_ID')
  }
  const tenantId = await resolveDemoTenantId(slug, fetcher)
  for (const role of Object.keys(DEMO_ROLE_EMAILS) as DemoRole[]) {
    await assertDemoRoleProfile(role, tenantId, fetcher)
  }
  await assertDemoProject(projectId, tenantId, fetcher)
}
