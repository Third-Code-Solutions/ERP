import { expect, test } from '@playwright/test'
import type { CortexEntityResponse } from '../src/lib/cortex/entity-response'

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
    providerRequests.push(url.toString())
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
    nodes: Array<{ id: string; type: string; title: string; refTable: string; refId: string; projectId: string | null }>
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

  const canvas = page.locator('.cortex-graphcanvas')
  await expect(canvas).toHaveAttribute('data-visible-nodes', String(graph.nodes.length))
  await expect.poll(async () => Number(await canvas.getAttribute('data-visible-labels'))).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Records', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Graph records' }).getByRole('button')).toHaveCount(graph.nodes.length)
  const firstRecord = page.getByRole('list', { name: 'Graph records' }).getByRole('button').first()
  await firstRecord.focus()
  await page.keyboard.press('Enter')
  const detail = page.getByRole('complementary', { name: 'Record detail' })
  await expect(detail).toBeVisible()
  await expect(detail).toBeFocused()
  await expect(detail.locator('.cortex-panel__skeleton')).toHaveCount(0)
  await expect(detail.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close detail' }).click()
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await page.getByTitle('Conversation history').click()
  await expect(page.getByRole('searchbox', { name: 'Search saved conversations' })).toBeVisible()
  await page.getByTitle('Conversation history').click()
  await expect(page.getByRole('textbox', { name: 'Message to Cortex' })).toBeVisible()
  await expect(page.getByText('Cortex answers questions with evidence.', { exact: false })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'laptop', width: 1024, height: 900 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'small-mobile', width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow, viewport.name).toBeLessThanOrEqual(1)
    const agentBounds = await page.locator('.cortex-agent').boundingBox()
    expect(agentBounds).not.toBeNull()
    for (const control of [page.getByTitle('Conversation history'), page.getByTitle('New chat'), page.getByRole('textbox', { name: 'Message to Cortex' })]) {
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x, viewport.name).toBeGreaterThanOrEqual(agentBounds!.x)
      expect(bounds!.x + bounds!.width, viewport.name).toBeLessThanOrEqual(agentBounds!.x + agentBounds!.width)
    }
    await page.screenshot({
      path: testInfo.outputPath(`cortex-route-${viewport.name}.png`),
      fullPage: true,
    })
  }

  // Local synthetic density fixture: never persisted or sent to a provider.
  const rootNode = graph.nodes.find((node) => node.refTable === 'projects')!
  const denseNodes = [rootNode, ...Array.from({ length: 80 }, (_, index) => ({
    ...rootNode, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: `Electrical lighting fixture and mechanical installation ${index + 1}`,
  }))]
  let graphMode: 'dense' | 'invalid' | 'empty' = 'dense'
  await page.route('**/api/cortex/graph', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      nodes: graphMode === 'invalid' ? null : graphMode === 'empty' ? [] : denseNodes,
      links: graphMode === 'dense' ? denseNodes.slice(1).map((node) => ({ source: rootNode.id, target: node.id, type: 'part_of' })) : [],
    }),
  }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await expect(canvas).toHaveAttribute('data-visible-nodes', '81')
  await expect.poll(async () => Number(await canvas.getAttribute('data-visible-labels'))).toBeGreaterThan(3)
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('cortex-dense-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cluster by type' }).click()
  await expect(canvas).toHaveAttribute('data-visible-nodes', '81')
  await page.locator('.cortex-type-filters summary').click()
  await page.getByTitle('Hide Project', { exact: true }).click()
  await expect(page.getByText('All record types are hidden.')).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(canvas).toBeVisible()
  graphMode = 'invalid'
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load the graph' })).toBeVisible()
  graphMode = 'dense'
  await page.getByRole('button', { name: 'Retry graph' }).click()
  await expect(canvas).toHaveAttribute('data-visible-nodes', '81')
  graphMode = 'empty'
  await page.reload()
  await expect(page.getByText('The graph is empty for now.', { exact: false })).toBeVisible()

  await page.unroute('**/api/cortex/graph')
  await page.route(`**/api/cortex/entity/${rootNode.refTable}/${rootNode.refId}`, async (route) => {
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    const original = await response.json() as CortexEntityResponse
    const first = original.citations[0]!
    // Presentation-only fixture ensures the full inspector is not stuck at four sources.
    const citations = Array.from({ length: 9 }, (_, index) => ({ ...first,
      nodeId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      refId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      title: `Source drawing with a long descriptive title ${index + 1}`,
    }))
    await route.fulfill({ response, json: { ...original, citations } })
  })
  const focusedUrl = `${WEB_ORIGIN}/cortex?refTable=${rootNode.refTable}&refId=${rootNode.refId}`
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(focusedUrl)
    await expect(page.locator('.cortex-focusbar')).toBeVisible()
    await expect(detail).toBeVisible()
    await expect(detail.locator('.cortex-panel__skeleton')).toHaveCount(0)
    await expect(detail.locator('.cortex-panel__chips > li')).toHaveCount(9)
    await expect(detail.getByText('View all sources in graph')).toHaveCount(0)
    expect(await detail.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    if (width === 320) {
      await expect(page.getByRole('button', { name: 'Records', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('link', { name: 'Ask Cortex', exact: true })).toBeVisible()
    }
    await page.screenshot({ path: testInfo.outputPath(`cortex-focused-${width}.png`), fullPage: true })
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
  expect(providerRequests).toEqual([])
  expect(semanticIndexRequests).toBe(0)
  expect(realtimeConnections).toBe(6)
  expect(consoleErrors).toEqual([])
})
