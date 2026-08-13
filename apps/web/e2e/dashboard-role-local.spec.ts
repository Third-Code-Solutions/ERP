import { expect, test } from '@playwright/test'
import { readE2EEnv } from './helpers/env'

const RUN_MAGIC_LINK_TEST = process.env.E2E_MAGIC_LINK_AUTH === '1'

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

test.describe('permission-aware dashboard', () => {
  test.skip(
    !RUN_MAGIC_LINK_TEST,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable one-time-link role QA.'
  )

  test('keeps executive data out of a viewer dashboard', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    const env = readE2EEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const baseUrl = testInfo.project.use.baseURL
    expect(supabaseUrl).toBeTruthy()
    expect(serviceRoleKey).toBeTruthy()
    expect(anonKey).toBeTruthy()
    expect(baseUrl).toBeTruthy()

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?select=email,tenant_id&role=eq.viewer&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey!,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    )
    expect(profileResponse.ok).toBe(true)
    const profiles = (await profileResponse.json()) as Array<{
      email: string
      tenant_id: string
    }>
    expect(profiles).toHaveLength(1)

    const documentResponse = await fetch(
      `${supabaseUrl}/rest/v1/documents?select=id,file_name&tenant_id=eq.${encodeURIComponent(profiles[0]!.tenant_id)}&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey!,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    )
    expect(documentResponse.ok).toBe(true)
    const tenantDocuments = (await documentResponse.json()) as Array<{
      id: string
      file_name: string
    }>
    expect(tenantDocuments).toHaveLength(1)
    const tenantDocument = tenantDocuments[0]!
    const documentSearchTerm = tenantDocument.file_name.slice(0, 80)
    expect(documentSearchTerm.length).toBeGreaterThanOrEqual(2)

    const linkResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/generate_link`,
      {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey!,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'magiclink',
          email: profiles[0]!.email,
          options: { redirectTo: `${baseUrl}/dashboard` },
        }),
      }
    )
    expect(linkResponse.ok).toBe(true)
    const linkBody = (await linkResponse.json()) as { action_link?: string }
    expect(linkBody.action_link).toBeTruthy()

    const verifyResponse = await fetch(linkBody.action_link!, {
      redirect: 'manual',
    })
    const redirectLocation = verifyResponse.headers.get('location')
    expect(redirectLocation).toBeTruthy()
    const authParams = new URLSearchParams(
      new URL(redirectLocation!).hash.replace(/^#/, '')
    )
    const accessToken = authParams.get('access_token')
    const refreshToken = authParams.get('refresh_token')
    const expiresAt = Number(authParams.get('expires_at'))
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    try {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: anonKey!,
          Authorization: `Bearer ${accessToken}`,
        },
      })
      expect(userResponse.ok).toBe(true)
      const user = await userResponse.json()
      const projectRef = new URL(supabaseUrl!).host.split('.')[0]!
      const sessionValue = `base64-${Buffer.from(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: Number(authParams.get('expires_in')),
          expires_at: expiresAt,
          token_type: authParams.get('token_type'),
          user,
        })
      ).toString('base64')}`
      const baseOrigin = new URL(baseUrl!)
      await page.context().addCookies([
        {
          name: `sb-${projectRef}-auth-token`,
          value: sessionValue,
          domain: baseOrigin.hostname,
          path: '/',
          httpOnly: false,
          secure: baseOrigin.protocol === 'https:',
          sameSite: 'Lax',
          expires: expiresAt,
        },
      ])

      const documentSearch = await page.request.get(
        `${baseUrl}/api/search?q=${encodeURIComponent(documentSearchTerm)}`
      )
      expect(documentSearch.status()).toBe(200)
      expect(documentSearch.headers()['cache-control']).toContain('private')
      expect(documentSearch.headers()['cache-control']).toContain('no-store')
      expect(documentSearch.headers()['vary']).toContain('Cookie')
      const documentSearchBody = (await documentSearch.json()) as {
        hits: Array<{ title: string; type: string }>
      }
      expect(documentSearchBody.hits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: tenantDocument.file_name,
            type: 'document',
          }),
        ])
      )
      expect(
        documentSearchBody.hits.every((hit) =>
          ['document', 'task'].includes(hit.type)
        )
      ).toBe(true)

      const literalProbe = await page.request.get(
        `${baseUrl}/api/search?q=${encodeURIComponent('%_\\third-code-literal-probe-019f')}`
      )
      expect(literalProbe.status()).toBe(200)
      expect(await literalProbe.json()).toEqual({ hits: [] })

      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText ?? ''
        if (errorText && errorText !== 'net::ERR_ABORTED') {
          errors.push(`${request.method()} ${request.url()} ${errorText}`)
        }
      })
      let cortexChatRequests = 0
      const commandSearchQueries: string[] = []
      page.on('request', (request) => {
        const requestUrl = new URL(request.url())
        if (requestUrl.pathname === '/api/cortex/chat') {
          cortexChatRequests += 1
        }
        if (requestUrl.pathname === '/api/search') {
          commandSearchQueries.push(requestUrl.searchParams.get('q') ?? '')
        }
      })
      const cortexDraft = 'Which active project needs attention?'

      for (const viewport of [
        { name: 'desktop', width: 1440, height: 1000 },
        { name: 'tablet', width: 768, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        const response = await page.goto(`${baseUrl}/dashboard`, {
          waitUntil: 'domcontentloaded',
        })
        expect(response?.status()).toBe(200)
        await expect(
          page.getByRole('heading', { name: 'My work' })
        ).toBeVisible()
        await expect(page.getByText('Today · Viewer')).toBeVisible()
        await expect(page.getByText('Pipeline analytics')).toHaveCount(0)
        await expect(page.getByText('Active Pipeline TCV')).toHaveCount(0)
        await expect(page.getByRole('link', { name: /Due today/ })).toHaveAttribute(
          'href',
          '/tasks'
        )
        const quickAccess = page.getByRole('region', { name: 'Quick access' })
        await expect(
          quickAccess.getByRole('link', { name: 'My Tasks' })
        ).toBeVisible()
        await expect(
          quickAccess.getByRole('link', { name: 'Documents' })
        ).toBeVisible()
        await expect(page.getByRole('link', { name: 'Finance' })).toHaveCount(0)

        await page
          .getByRole('button', { name: /Open global search/ })
          .click()
        const searchInput = page.getByRole('textbox', { name: 'Search' })
        await searchInput.fill(documentSearchTerm)
        await expect(
          page
            .getByRole('option')
            .filter({ hasText: tenantDocument.file_name })
            .first()
        ).toBeVisible()
        await page.getByRole('tab', { name: 'Ask Cortex' }).click()
        const cortexInput = page.getByRole('textbox', {
          name: 'Ask Cortex',
        })
        await cortexInput.fill(cortexDraft)
        const askCortex = page.getByRole('option', {
          name: `Ask Cortex: ${cortexDraft}`,
        })
        await expect(askCortex).toBeVisible()
        await page.waitForTimeout(300)
        expect(commandSearchQueries).not.toContain(cortexDraft)
        expect(
          await page
            .getByRole('dialog', { name: 'Command palette' })
            .evaluate(
              (dialog) =>
                dialog.getBoundingClientRect().right - window.innerWidth
            ),
          `${viewport.name} command palette overflow`
        ).toBeLessThanOrEqual(1)
        if (viewport.name !== 'tablet') {
          await page.screenshot({
            path: testInfo.outputPath(
              `search-cortex-handoff-${viewport.name}.png`
            ),
            fullPage: false,
          })
        }

        if (viewport.name === 'desktop') {
          await askCortex.click()
          await expect(page).toHaveURL(`${baseUrl}/cortex`)
          const cortexComposer = page.getByRole('textbox', {
            name: 'Message to Cortex',
          })
          await expect(cortexComposer).toHaveValue(cortexDraft)
          await expect(cortexComposer).toBeFocused()
          expect(cortexChatRequests).toBe(0)
          expect(page.url()).not.toContain(encodeURIComponent(cortexDraft))
          expect(
            await page.evaluate(() =>
              Object.keys(window.sessionStorage).some((key) =>
                key.startsWith('third-code-erp:cortex-draft:')
              )
            )
          ).toBe(false)
          const dashboardResponse = await page.goto(`${baseUrl}/dashboard`, {
            waitUntil: 'domcontentloaded',
          })
          expect(dashboardResponse?.status()).toBe(200)
          await expect(
            page.getByRole('heading', { name: 'My work' })
          ).toBeVisible()
        } else {
          await page.keyboard.press('Escape')
          await expect(
            page.getByRole('dialog', { name: 'Command palette' })
          ).toHaveCount(0)
        }

        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth
          ),
          `${viewport.name} horizontal overflow`
        ).toBeLessThanOrEqual(1)

        if (viewport.name !== 'tablet') {
          await page.screenshot({
            path: testInfo.outputPath(
              `permission-aware-dashboard-${viewport.name}.png`
            ),
            fullPage: true,
          })
        }
      }

      const viewerRenderablePaths = [
        '/dashboard',
        '/cortex',
        '/process',
        '/tasks',
        '/documents',
        '/settings',
      ]
      for (const path of viewerRenderablePaths) {
        const response = await page.goto(`${baseUrl}${path}`, {
          waitUntil: 'domcontentloaded',
        })
        expect(response?.status() ?? 0, path).toBe(200)
        expect(page.url(), path).not.toMatch(/\/auth\/login/)
        await expect(page.locator('body'), path).toBeVisible()
        if (path === '/process') {
          await expect(
            page.getByRole('heading', { name: 'Process Health' })
          ).toBeVisible()
          await expect(page.getByText('Observe mode active')).toBeVisible()
          await expect(
            page.getByText(/Escalation remains suppressed during the initial BU observation period/)
          ).toBeVisible()
        }
      }

      const authenticatedSurfacePaths = [
        '/dashboard',
        '/projects',
        '/pipeline',
        '/bom',
        '/cortex',
        '/finance',
        '/inventory',
        '/invoices',
        '/purchase-orders',
        '/documents',
        '/reports',
        '/settings',
        '/procurement',
        '/process',
        '/crm',
        '/admin',
        '/tasks',
        '/permits',
        '/punchlist',
        '/warranty',
        '/claims',
        '/inspection',
        '/weekly-report',
      ]
      for (const path of authenticatedSurfacePaths) {
        const response = await page.request.get(`${baseUrl}${path}`, {
          maxRedirects: 0,
        })
        expect(response?.status() ?? 0, path).toBeGreaterThanOrEqual(200)
        expect(response?.status() ?? 0, path).toBeLessThan(500)
        expect(response?.status() ?? 0, path).not.toBe(429)
        const location = response.headers().location ?? ''
        expect(location, path).not.toMatch(/\/auth\/login/)
      }

      expect(errors).toEqual([])
    } finally {
      if (accessToken) {
        const logoutResponse = await fetch(
          `${supabaseUrl}/auth/v1/logout?scope=local`,
          {
            method: 'POST',
            headers: {
              apikey: anonKey!,
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )
        expect([200, 204, 401, 403]).toContain(logoutResponse.status)
      }
      if (!page.isClosed()) {
        await page.context().clearCookies()
      }
    }
  })
})
