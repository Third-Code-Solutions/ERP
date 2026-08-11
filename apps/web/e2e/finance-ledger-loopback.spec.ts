import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4378'
const WEB_ORIGIN = 'http://127.0.0.1:4377'

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
  debitAccountId: string
  creditAccountId: string
  journalEntryId: string
  ledgerRequests: Array<{
    path: string
    authorization: string
    requestId: string
  }>
  unsupportedRequests: Array<{ method: string; path: string }>
}

test('proves the authenticated Web ledger page uses Core and preserves tenant-safe rendering', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(
    `${WEB_ORIGIN}/finance/ledger`,
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
      refresh_token: 'local-finance-ledger-refresh-token',
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
  await page.routeWebSocket('ws://127.0.0.1:4378/**', (webSocket) => {
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

  const pageResponse = await page.goto(`${WEB_ORIGIN}/finance/ledger`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'General ledger', exact: true })
  ).toBeVisible()
  await expect(page.getByText('Loopback debit line', { exact: true })).toBeVisible()
  await expect(page.getByText('Loopback credit line', { exact: true })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.getByText('Visible lines', { exact: true })).toBeVisible()
  await expect(page.getByText('₱100.00', { exact: true })).toHaveCount(4)
  await expect(page.locator('#ledger-account-filter option')).toHaveCount(3)

  const stateBeforeFilter = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateBeforeFilter.ok()).toBe(true)
  const firstState = (await stateBeforeFilter.json()) as HarnessState
  expect(firstState.ledgerRequests).toHaveLength(1)
  expect(firstState.ledgerRequests[0]?.authorization).toBe(
    `Bearer ${session.accessToken}`
  )
  // The proxy assertion below checks each query field without depending on
  // URLSearchParams object identity.
  const firstQuery = new URL(
    firstState.ledgerRequests[0]!.path,
    'http://core.local'
  ).searchParams
  expect(firstQuery.get('page')).toBe('1')
  expect(firstQuery.get('limit')).toBe('500')
  expect(firstQuery.get('accountId')).toBeNull()

  await page.goto(`${WEB_ORIGIN}/finance/ledger?account=${firstState.debitAccountId}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('Loopback debit line', { exact: true })).toBeVisible()
  await expect(page.getByText('Loopback credit line', { exact: true })).toHaveCount(0)

  const state = (await (
    await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  ).json()) as HarnessState
  expect(state.ledgerRequests).toHaveLength(2)
  expect(state.ledgerRequests.every((request) => request.authorization === `Bearer ${session.accessToken}`)).toBe(true)
  const filteredQuery = new URL(
    state.ledgerRequests[1]!.path,
    'http://core.local'
  ).searchParams
  expect(filteredQuery.get('accountId')).toBe(firstState.debitAccountId)
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
      path: testInfo.outputPath(`finance-ledger-${viewport.name}.png`),
      fullPage: true,
    })
  }
})
