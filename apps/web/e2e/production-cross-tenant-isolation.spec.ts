import { expect, test } from './base-test'
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

const postgrestError = z.object({ code: z.string() })

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

        const userJwtHeaders = {
          apikey: auth.anonKey,
          Authorization: `Bearer ${auth.accessToken}`,
        }
        // 20261124200000 revoked the user JWT's SELECT on projects: own and
        // foreign reads through PostgREST are both refused, not just filtered.
        for (const [label, projectId] of [
          ['own', configuredProjectId],
          ['foreign', foreignProjectId],
        ] as const) {
          const denied = await fetch(
            `${auth.supabaseUrl}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(projectId)}`,
            { headers: userJwtHeaders, cache: 'no-store' }
          )
          expect(denied.status, `${role} ${label} project REST read status`).toBe(403)
          const deniedBody = postgrestError.safeParse(await denied.json())
          expect(
            deniedBody.success ? deniedBody.data.code : null,
            `${role} ${label} project REST read must be a privilege denial`
          ).toBe('42501')
        }

        // Positive RLS control on a table the user JWT still reads: the caller
        // sees its own profile and no user of another tenant.
        const usersResponse = await fetch(
          `${auth.supabaseUrl}/rest/v1/users?select=id,tenant_id`,
          { headers: userJwtHeaders, cache: 'no-store' }
        )
        expect(usersResponse.status, `${role} users RLS control status`).toBe(200)
        const usersParsed = z
          .array(z.object({ id: z.string().uuid(), tenant_id: z.string().uuid() }))
          .safeParse(await usersResponse.json())
        expect(usersParsed.success, `${role} users RLS control shape`).toBe(true)
        const visibleUsers = usersParsed.success ? usersParsed.data : []
        const ownUserId = auth.userId
        expect(
          visibleUsers.filter((user) => user.id === ownUserId).length,
          `${role} own user row must be visible through RLS`
        ).toBe(1)
        expect(
          visibleUsers.filter((user) => user.tenant_id !== demoTenantId).length,
          `${role} users of another tenant must be invisible`
        ).toBe(0)

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
