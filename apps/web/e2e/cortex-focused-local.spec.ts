import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const RUN_MAGIC_LINK_TEST = process.env.E2E_MAGIC_LINK_AUTH === '1'
const FOCUS_REF_TABLE = 'projects'
const FOCUS_REF_ID = '08ab6e94-2374-4a7f-8d62-8919ba3d1c09'

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

function readLocalEnv(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [
        match[1]!,
        match[2]!.trim().replace(/^"(.*)"$/, '$1'),
      ])
  )
}

test.describe('Cortex focused graph', () => {
  test.skip(
    !RUN_MAGIC_LINK_TEST,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable the local one-time-link test.'
  )

  test('opens an authorized record neighborhood without responsive overflow', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000)
    const env = readLocalEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    const email = process.env.E2E_USER_EMAIL ?? 'test@thirdcode.local'
    const baseUrl = testInfo.project.use.baseURL
    expect(supabaseUrl).toBeTruthy()
    expect(serviceRoleKey).toBeTruthy()
    expect(baseUrl).toBeTruthy()

    for (const protectedPath of ['/cortex', '/finance', '/inventory']) {
      const protectedResponse = await page.request.get(
        `${baseUrl}${protectedPath}`,
        { maxRedirects: 0 }
      )
      expect(protectedResponse.status(), protectedPath).toBe(307)
      expect(protectedResponse.headers()['location'], protectedPath).toBe(
        '/auth/login'
      )
    }

    const unauthenticatedSearch = await page.request.get(
      `${baseUrl}/api/cortex/search?q=unauthenticated-boundary`
    )
    expect(unauthenticatedSearch.status()).toBe(401)
    expect(unauthenticatedSearch.headers()['content-type']).toContain(
      'application/json'
    )
    expect(unauthenticatedSearch.headers()['cache-control']).toContain(
      'private'
    )
    expect(unauthenticatedSearch.headers()['cache-control']).toContain(
      'no-store'
    )
    expect(unauthenticatedSearch.headers()['vary']).toContain('Cookie')

    const focusUrl = `${baseUrl}/cortex?refTable=${FOCUS_REF_TABLE}&refId=${FOCUS_REF_ID}`
    const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey!,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirectTo: focusUrl },
      }),
    })
    expect(linkResponse.ok).toBe(true)
    const linkBody = (await linkResponse.json()) as {
      action_link?: string
    }
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
    const expiresIn = Number(authParams.get('expires_in'))
    const expiresAt = Number(authParams.get('expires_at'))
    const tokenType = authParams.get('token_type')
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
        expires_in: expiresIn,
        expires_at: expiresAt,
        token_type: tokenType,
        user,
      })
    ).toString('base64')}`
    await page.context().addCookies([
      {
        name: `sb-${projectRef}-auth-token`,
        value: sessionValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
        expires: expiresAt,
      },
    ])

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    const invalidResponse = await page.request.get(
      `${baseUrl}/api/cortex/graph?refTable=projects&refId=not-a-uuid`
    )
    expect(invalidResponse.status()).toBe(400)

    await page.goto(`${baseUrl}/projects/${FOCUS_REF_ID}`, {
      waitUntil: 'domcontentloaded',
    })
    const focusLink = page.getByRole('link', { name: 'Open focused graph' })
    await expect(focusLink).toHaveAttribute(
      'href',
      `/cortex?refTable=${FOCUS_REF_TABLE}&refId=${FOCUS_REF_ID}`
    )

    const graphResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/cortex/graph?') &&
        response.request().method() === 'GET'
    )
    await focusLink.click()
    await page.waitForURL(`**/cortex?refTable=${FOCUS_REF_TABLE}&refId=${FOCUS_REF_ID}`)
    const graphResponse = await graphResponsePromise
    expect(graphResponse.status()).toBe(200)
    const graph = (await graphResponse.json()) as {
      focusNodeId?: string
      nodes: Array<{ id: string; refTable: string; refId: string }>
      links: unknown[]
    }
    expect(graph.focusNodeId).toBeTruthy()
    expect(graph.nodes.some((node) => node.id === graph.focusNodeId)).toBe(true)
    expect(
      graph.nodes.some(
        (node) =>
          node.refTable === FOCUS_REF_TABLE && node.refId === FOCUS_REF_ID
      )
    ).toBe(true)
    expect(graph.nodes.length).toBeLessThanOrEqual(81)
    expect(graph.links.length).toBeLessThanOrEqual(80)

    await expect(page.getByText('Focused record')).toBeVisible()
    await expect(
      page.getByText('TH/RD CODE FINAL PHASE', { exact: true })
    ).toBeVisible()
    const agentContext = page.locator(
      '[data-cortex-agent-context="projects"]'
    )
    await expect(agentContext).toContainText('Focused on')
    await expect(agentContext).toContainText('TH/RD CODE FINAL PHASE')
    await expect(agentContext).toContainText(
      'New chats stay with this record'
    )
    await expect(
      page.getByRole('button', { name: 'Summarize this record' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show all records' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Record detail' })).toBeVisible()
    await expect(page.locator('.cortex-panel__skeleton')).toHaveCount(0)

    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'tablet', width: 768, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      const overflowSources = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return {
              selector:
                element.id ||
                element.className ||
                element.tagName.toLowerCase(),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              scrollWidth: element.scrollWidth,
            }
          })
          .filter(
            ({ left, right, width }) =>
              width > 0 && (left < -1 || right > window.innerWidth + 1)
          )
          .sort((a, b) => b.right - a.right)
          .slice(0, 8)
      )
      expect(
        overflow,
        `${viewport.name}: ${JSON.stringify(overflowSources)}`
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath(`cortex-focused-${viewport.name}.png`),
        fullPage: true,
      })
    }

    await page.getByRole('button', { name: 'Show all records' }).click()
    await page.waitForURL(`${baseUrl}/cortex`)
    await expect(page.getByText('Focused record')).toHaveCount(0)
    await expect(page.getByText('Company-wide')).toBeVisible()

    const deepLinkConversationId =
      '33333333-3333-4333-8333-333333333333'
    await page.route(
      new RegExp('/api/cortex/conversations$'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              {
                id: deepLinkConversationId,
                title: 'Company priorities',
                created_at: '2026-07-29T00:00:00.000Z',
                updated_at: '2026-07-29T00:00:00.000Z',
                context: null,
              },
              {
                id: '44444444-4444-4444-8444-444444444444',
                title: 'Invoice follow-up',
                created_at: '2026-07-29T00:00:00.000Z',
                updated_at: '2026-07-29T00:00:00.000Z',
                context: {
                  refTable: 'invoices',
                  refId: '55555555-5555-4555-8555-555555555555',
                  nodeType: 'invoice',
                  title: 'INV-1042',
                },
              },
            ],
          }),
        })
      }
    )
    await page.route(
      new RegExp(
        `/api/cortex/conversations/${deepLinkConversationId}$`
      ),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            context: null,
            messages: [
              { role: 'user', content: 'Show current priorities.' },
              {
                role: 'assistant',
                content: 'Priorities stay grounded in authorized records.',
                citations: [],
              },
            ],
          }),
        })
      }
    )

    await page.goto(`${baseUrl}/cortex`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByTitle('Conversation history').click()
    const historySearch = page.getByRole('searchbox', {
      name: 'Search saved conversations',
    })
    await historySearch.fill('invoice 1042')
    await expect(page.getByText('Invoice follow-up')).toBeVisible()
    await expect(page.getByText('Company priorities')).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(1)
    await page.locator('.cortex-agent').screenshot({
      path: testInfo.outputPath('cortex-history-search-mobile.png'),
    })
    await page.getByRole('button', {
      name: 'Clear conversation search',
    }).click()
    await expect(historySearch).toBeFocused()
    await expect(page.getByText('Company priorities')).toBeVisible()

    await page.goto(
      `${baseUrl}/cortex?conversationId=${deepLinkConversationId}`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.locator('.cortex-msg')).toHaveCount(2)
    await expect(page.getByText('Show current priorities.')).toBeVisible()
    await expect(page).toHaveURL(
      `${baseUrl}/cortex?conversationId=${deepLinkConversationId}`
    )

    await page.getByTitle('New chat').click()
    await expect(page).toHaveURL(`${baseUrl}/cortex`)
    await expect(page.locator('.cortex-msg')).toHaveCount(0)
    expect(consoleErrors).toEqual([])

    const logoutResponse = await fetch(
      `${supabaseUrl}/auth/v1/logout?scope=global`,
      {
        method: 'POST',
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    expect(logoutResponse.ok).toBe(true)
  })
})
