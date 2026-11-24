import { expect, test } from './fixtures'
import { z } from 'zod'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'
import {
  assertDemoProject,
  ISOLATION_PROJECT_CLIENT,
  ISOLATION_PROJECT_NAME,
  resolveDemoTenantId,
  resolveForeignProjectId,
} from './helpers/production-demo-boundary'

// Probe only the dedicated synthetic project through the cookie-aware request
// client. Never render or attach the response body to the production report.
test.use({ screenshot: 'off', trace: 'off' })

test('all demo roles cannot read an active project from another tenant', async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000)
  test.skip(
    process.env.E2E_CROSS_TENANT_PROOF !== '1',
    'Enable only in the protected production promotion workflow.'
  )

  const baseUrl = testInfo.project.use.baseURL
  if (!baseUrl) throw new Error('Production E2E base URL is required')
  const slug = process.env.E2E_DEMO_TENANT_SLUG?.trim()
  const configuredProjectId = z.string().uuid().parse(process.env.E2E_PROJECT_ID)
  if (!slug) throw new Error('Dedicated demo tenant slug is required')

  const demoTenantId = await resolveDemoTenantId(slug)
  await assertDemoProject(configuredProjectId, demoTenantId)
  const foreignProjectId = await resolveForeignProjectId(demoTenantId)
  const roles: MagicLinkRole[] = [
    'admin', 'commercial', 'cx', 'design', 'finance', 'owner',
    'procurement', 'safety', 'sales', 'sd_pm_pe', 'viewer',
  ]

  for (const role of roles) {
    await test.step(role, async () => {
      const context = await browser.newContext()
      let auth: Awaited<ReturnType<typeof authenticateRole>> | undefined
      try {
        auth = await authenticateRole(context, baseUrl, role)
        expect(auth.tenantId, `${role} demo tenant`).toBe(demoTenantId)

        const ownProject = await context.request.get(`${baseUrl}/projects/${configuredProjectId}`, {
          maxRedirects: 0,
        })
        expect(ownProject.status(), `${role} demo project control route`).toBe(200)
        const ownBody = await ownProject.text()
        expect(
          ownBody.includes('NEXT_HTTP_ERROR_FALLBACK;404'),
          `${role} demo project control content`
        ).toBe(false)
        await ownProject.dispose()

        const ownRestResponse = await fetch(
          `${auth.supabaseUrl}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(configuredProjectId)}`,
          {
            headers: {
              apikey: auth.anonKey,
              Authorization: `Bearer ${auth.accessToken}`,
            },
            cache: 'no-store',
          }
        )
        expect(ownRestResponse.status, `${role} own project RLS control status`).toBe(200)
        const ownRestRows: unknown = await ownRestResponse.json()
        const ownRestParsed = z.array(z.object({ id: z.string().uuid() })).safeParse(ownRestRows)
        expect(
          ownRestParsed.success &&
            ownRestParsed.data.length === 1 &&
            ownRestParsed.data[0]?.id === configuredProjectId,
          `${role} own project must be visible through RLS`
        ).toBe(true)

        const restResponse = await fetch(
          `${auth.supabaseUrl}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(foreignProjectId)}`,
          {
            headers: {
              apikey: auth.anonKey,
              Authorization: `Bearer ${auth.accessToken}`,
            },
            cache: 'no-store',
          }
        )
        expect(restResponse.status, `${role} authenticated RLS project read`).toBe(200)
        const restRows: unknown = await restResponse.json()
        expect(
          Array.isArray(restRows) && restRows.length === 0,
          `${role} foreign project must be invisible`
        ).toBe(true)

        const foreignProject = await context.request.get(`${baseUrl}/projects/${foreignProjectId}`, {
          maxRedirects: 0,
        })
        const foreignBody = await foreignProject.text()
        // Next.js may stream the parent shell before notFound(), yielding HTTP 200
        // with an RSC 404 marker. The successful control route must lack that marker.
        expect([200, 404], `${role} foreign project Web route status`).toContain(foreignProject.status())
        expect(
          foreignBody.includes('NEXT_HTTP_ERROR_FALLBACK;404'),
          `${role} foreign project not-found state`
        ).toBe(true)
        expect(
          foreignBody.includes(ISOLATION_PROJECT_NAME),
          `${role} foreign project name must stay private`
        ).toBe(false)
        expect(
          foreignBody.includes(ISOLATION_PROJECT_CLIENT),
          `${role} foreign project client must stay private`
        ).toBe(false)
        await foreignProject.dispose()
      } finally {
        try {
          if (auth) await auth.cleanup()
        } finally {
          await context.close()
        }
      }
    })
  }
})
