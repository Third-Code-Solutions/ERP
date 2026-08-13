import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4328'
const WEB_ORIGIN = 'http://127.0.0.1:4327'

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface HarnessRequest {
  method: string
  path: string
  query: string
}

test('renders the authenticated Cortex route against loopback auth and PostgreSQL', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(`${WEB_ORIGIN}/cortex`, {
    maxRedirects: 0,
  })
  expect(unauthenticatedPage.status()).toBe(307)
  const loginLocation = unauthenticatedPage.headers().location
  expect(loginLocation).toBeTruthy()
  expect(new URL(loginLocation!, WEB_ORIGIN).pathname).toBe('/auth/login')

  const unauthenticatedGraph = await page.request.get(
    `${WEB_ORIGIN}/api/cortex/graph`
  )
  expect(unauthenticatedGraph.status()).toBe(401)

  const sessionResponse = await fetch(`${AUTH_ORIGIN}/__harness__/session`)
  expect(sessionResponse.ok).toBe(true)
  const session = (await sessionResponse.json()) as HarnessSession
  const sessionValue = `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: 'local-contract-refresh-token',
      expires_in: session.expiresAt - Math.floor(Date.now() / 1000),
      expires_at: session.expiresAt,
      token_type: 'bearer',
      user: session.user,
    })
  ).toString('base64')}`

  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: sessionValue,
      url: WEB_ORIGIN,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: session.expiresAt,
    },
  ])

  const consoleErrors: string[] = []
  const providerRequests: string[] = []
  let semanticIndexRequests = 0
  let realtimeConnections = 0
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/cortex/semantic-index-jobs')) {
      semanticIndexRequests += 1
    }
  })
  await page.routeWebSocket('ws://127.0.0.1:4328/**', (webSocket) => {
    realtimeConnections += 1
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return
      const decoded = JSON.parse(message) as
        | [string | null, string | null, string, string, unknown]
        | {
            event?: string
            join_ref?: string | null
            ref?: string | null
            topic?: string
          }
      if (Array.isArray(decoded)) {
        const [joinRef, ref, topic, event] = decoded
        if (event !== 'heartbeat' && event !== 'phx_join') return
        webSocket.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            'phx_reply',
            { response: {}, status: 'ok' },
          ])
        )
        return
      }
      const payload = decoded as {
        event?: string
        join_ref?: string | null
        ref?: string | null
        topic?: string
      }
      if (payload.event !== 'heartbeat' && payload.event !== 'phx_join') return
      webSocket.send(
        JSON.stringify({
          event: 'phx_reply',
          join_ref: payload.join_ref ?? null,
          payload: { response: {}, status: 'ok' },
          ref: payload.ref ?? null,
          topic: payload.topic ?? 'phoenix',
        })
      )
    })
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    if (
      url.hostname === 'api.fontshare.com' &&
      url.pathname === '/v2/css'
    ) {
      providerRequests.push(url.toString())
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: '',
      })
      return
    }
    await route.abort('blockedbyclient')
  })

  const graphResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${WEB_ORIGIN}/api/cortex/graph` &&
      response.request().method() === 'GET'
  )
  const conversationsResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${WEB_ORIGIN}/api/cortex/conversations` &&
      response.request().method() === 'GET'
  )
  const pageResponse = await page.goto(`${WEB_ORIGIN}/cortex`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)

  const [graphResponse, conversationsResponse] = await Promise.all([
    graphResponsePromise,
    conversationsResponsePromise,
  ])
  expect(graphResponse.status()).toBe(200)
  expect(conversationsResponse.status()).toBe(200)
  expect(conversationsResponse.headers()['cache-control']).toContain('private')
  expect(conversationsResponse.headers()['cache-control']).toContain('no-store')
  expect(await conversationsResponse.json()).toEqual({ conversations: [] })

  const graph = (await graphResponse.json()) as {
    nodes: Array<{ refTable: string; refId: string }>
    links: unknown[]
  }
  expect(graph.nodes.length).toBeGreaterThan(0)
  expect(graph.links.length).toBeGreaterThan(0)
  expect(
    graph.nodes.some(
      (node) =>
        node.refTable === 'projects' &&
        node.refId === 'a6778017-a3d3-4ba5-8989-3127d75b458b'
    )
  ).toBe(true)

  await expect(
    page.getByRole('heading', { name: 'Cortex AI Brain', exact: true })
  ).toBeVisible()
  await expect(page.getByText('Knowledge Graph', { exact: true })).toBeVisible()
  await expect(page.getByText('Company-wide', { exact: true })).toBeVisible()
  const pausedIndexing = page.getByRole('button', {
    name: 'Semantic indexing paused',
  })
  await expect(pausedIndexing).toBeVisible()
  await expect(pausedIndexing).toBeDisabled()
  await expect(page.locator('.cortex-graph-shell--msg')).toHaveCount(0)
  await page.waitForTimeout(800)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow, viewport.name).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath(`cortex-route-${viewport.name}.png`),
      fullPage: true,
    })
  }

  const requestLogResponse = await fetch(
    `${AUTH_ORIGIN}/__harness__/requests`
  )
  expect(requestLogResponse.ok).toBe(true)
  const requestLog = (await requestLogResponse.json()) as {
    requests: HarnessRequest[]
  }
  expect(
    requestLog.requests.some(
      (request) =>
        request.method === 'GET' && request.path === '/auth/v1/user'
    )
  ).toBe(true)
  expect(
    requestLog.requests.some(
      (request) =>
        request.method === 'GET' &&
        request.path === '/rest/v1/users' &&
        request.query.includes('id=eq.')
    )
  ).toBe(true)
  expect(
    requestLog.requests.every((request) =>
      ['/auth/v1/user', '/rest/v1/users'].includes(request.path)
    )
  ).toBe(true)
  expect(providerRequests).toEqual([
    'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap',
  ])
  expect(semanticIndexRequests).toBe(0)
  expect(realtimeConnections).toBe(1)
  expect(consoleErrors).toEqual([])
})
