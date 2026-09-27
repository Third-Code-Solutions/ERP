import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { authenticateRole } from './helpers/supabase-magic-link'
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

test('demo viewer cannot read an active project from another tenant', async ({ browser }, testInfo) => {
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
  const context = await browser.newContext()
  let auth: Awaited<ReturnType<typeof authenticateRole>> | undefined

  try {
    auth = await authenticateRole(context, baseUrl, 'viewer')
    if (auth.tenantId !== demoTenantId) {
      throw new Error('Authenticated viewer is outside the dedicated demo tenant')
    }

    const ownProject = await context.request.get(`${baseUrl}/projects/${configuredProjectId}`, {
      maxRedirects: 0,
    })
    expect(ownProject.status(), 'demo project control route').toBe(200)
    const ownBody = await ownProject.text()
    expect(ownBody, 'demo project control content').not.toContain('NEXT_HTTP_ERROR_FALLBACK;404')
    await ownProject.dispose()

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
    expect(restResponse.status, 'authenticated RLS project read').toBe(200)
    const restRows: unknown = await restResponse.json()
    expect(
      Array.isArray(restRows) && restRows.length === 0,
      'foreign project must be invisible to the demo actor'
    ).toBe(true)

    const foreignProject = await context.request.get(`${baseUrl}/projects/${foreignProjectId}`, {
      maxRedirects: 0,
    })
    const foreignBody = await foreignProject.text()
    // Next.js may stream the parent shell before notFound(), yielding HTTP 200
    // with an RSC 404 marker. The successful control route must lack that marker.
    expect([200, 404], 'foreign project Web route status').toContain(foreignProject.status())
    expect(foreignBody, 'foreign project not-found state').toContain('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(foreignBody, 'foreign project name must stay private').not.toContain(ISOLATION_PROJECT_NAME)
    expect(foreignBody, 'foreign project client must stay private').not.toContain(ISOLATION_PROJECT_CLIENT)
    await foreignProject.dispose()
  } finally {
    try {
      if (auth) await auth.cleanup()
    } finally {
      await context.close()
    }
  }
})
