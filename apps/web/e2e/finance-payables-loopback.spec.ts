import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4392'
const WEB_ORIGIN = 'http://127.0.0.1:4391'

test.afterEach(async ({ page }) => {
  const cleanup = await page.request.post(`${AUTH_ORIGIN}/__harness__/cleanup`)
  expect(cleanup.ok()).toBe(true)
})

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface HarnessState {
  tenantId: string
  projectId: string
  vendorId: string
  postedInternalNumbers: string[]
  payablesRequests: Array<{
    path: string
    authorization: string
    requestId: string
  }>
  unsupportedRequests: Array<{ method: string; path: string }>
}

test('proves the authenticated Web payables page uses Core and preserves tenant-safe rendering', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(
    `${WEB_ORIGIN}/finance/payables`,
    { maxRedirects: 0 }
  )
  expect(unauthenticatedPage.status()).toBe(307)
  expect(
    new URL(unauthenticatedPage.headers().location!, WEB_ORIGIN).pathname
  ).toBe('/auth/login')

  const sessionResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/session`
  )
  expect(sessionResponse.ok()).toBe(true)
  const session = (await sessionResponse.json()) as HarnessSession
  const sessionValue = `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: 'local-finance-payables-refresh-token',
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
  const blockedExternalRequests: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().includes('ERR_BLOCKED_BY_CLIENT')
    ) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.routeWebSocket('ws://127.0.0.1:4392/**', (webSocket) => {
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
      if (decoded.event !== 'heartbeat' && decoded.event !== 'phx_join') return
      webSocket.send(
        JSON.stringify({
          event: 'phx_reply',
          join_ref: decoded.join_ref ?? null,
          payload: { response: {}, status: 'ok' },
          ref: decoded.ref ?? null,
          topic: decoded.topic ?? 'phoenix',
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
    blockedExternalRequests.push(url.toString())
    await route.abort('blockedbyclient')
  })

  const pageResponse = await page.goto(`${WEB_ORIGIN}/finance/payables`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Payables', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Supplier bills', exact: true })
  ).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await expect(
    page.locator('.kpi-card-label').filter({ hasText: 'Open payable' })
  ).toBeVisible()
  await expect(
    page.locator('.kpi-card-label').filter({ hasText: 'Past due' })
  ).toBeVisible()
  await expect(
    page.locator('.kpi-card-label').filter({ hasText: 'Draft review' })
  ).toBeVisible()
  await expect(page.getByText('SI-LOOPBACK-PAYABLES-DRAFT', { exact: true })).toBeVisible()

  const stateResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState
  expect(state.postedInternalNumbers).toHaveLength(2)
  for (const internalNumber of state.postedInternalNumbers) {
    await expect(page.getByText(internalNumber, { exact: true })).toBeVisible()
  }

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toContain('1,650.00')
  expect(bodyText).toContain('1,100.00')
  expect(bodyText).toContain('550.00')
  expect(bodyText).toContain('330.00')
  expect(page.locator('.finance-aging-card')).toHaveCount(5)

  const rows = page.locator('tbody tr')
  await expect(rows.nth(0)).toContainText('draft')
  await expect(rows.nth(0)).toContainText('330.00')
  await expect(rows.nth(1)).toContainText('posted')
  await expect(rows.nth(2)).toContainText('posted')

  expect(state.payablesRequests).toHaveLength(1)
  expect(state.payablesRequests[0]?.authorization).toBe(
    `Bearer ${session.accessToken}`
  )
  expect(state.payablesRequests[0]?.requestId).toMatch(
    /^[0-9a-f-]{36}$/i
  )
  const query = new URL(
    state.payablesRequests[0]!.path,
    'http://core.local'
  ).searchParams
  expect(query.get('page')).toBe('1')
  expect(query.get('limit')).toBe('500')
  expect(query.get('vendorId')).toBeNull()
  expect(query.get('projectId')).toBeNull()
  expect(query.get('status')).toBeNull()
  expect(query.get('dueFrom')).toBeNull()
  expect(query.get('dueTo')).toBeNull()

  expect(
    state.unsupportedRequests.some(
      (request) => request.path !== '/realtime/v1/websocket'
    )
  ).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(blockedExternalRequests).toEqual(
    expect.arrayContaining([
      'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap',
    ])
  )

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
      path: testInfo.outputPath(`finance-payables-${viewport.name}.png`),
      fullPage: true,
    })
  }
})
