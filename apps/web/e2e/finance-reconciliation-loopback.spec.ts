import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4404'
const WEB_ORIGIN = 'http://127.0.0.1:4403'

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
  reconciliationRequests: Array<{
    path: string
    authorization: string
    requestId: string
  }>
  unsupportedRequests: Array<{ method: string; path: string }>
}

test('proves authenticated Web reconciliation page uses Core and preserves tenant-safe rendering', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(
    `${WEB_ORIGIN}/finance/reconciliation`,
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
      refresh_token: 'local-finance-reconciliation-refresh-token',
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
  await page.routeWebSocket('ws://127.0.0.1:4404/**', (webSocket) => {
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

  const pageResponse = await page.goto(`${WEB_ORIGIN}/finance/reconciliation`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Bank reconciliation', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Reconciliation evidence', exact: true })
  ).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  for (const label of [
    'Draft statements',
    'Open exceptions',
    'Reconciled',
    'Channels',
  ]) {
    await expect(page.locator('.kpi-card-label').filter({ hasText: label })).toBeVisible()
  }

  for (const reference of [
    'ST-LOOPBACK-RECON-DRAFT',
    'ST-LOOPBACK-RECON-RECONCILED',
    'ST-LOOPBACK-RECON-VOIDED',
  ]) {
    await expect(page.getByText(reference, { exact: true })).toBeVisible()
  }
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toContain('1,012.50')
  expect(bodyText).toContain('2,020.00')
  expect(bodyText).toContain('3,210.00')
  expect(bodyText).toContain('0 / 2 matched')
  expect(bodyText).toContain('0 / 1 matched')
  expect(bodyText).toContain('0 / 0 matched')

  const rows = page.locator('tbody tr')
  await expect(rows.nth(0)).toContainText('draft')
  await expect(rows.nth(0)).toContainText('1,012.50')
  await expect(rows.nth(1)).toContainText('reconciled')
  await expect(rows.nth(2)).toContainText('voided')

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState
  expect(state.reconciliationRequests).toHaveLength(1)
  expect(state.reconciliationRequests[0]?.authorization).toBe(
    `Bearer ${session.accessToken}`
  )
  expect(state.reconciliationRequests[0]?.requestId).toMatch(
    /^[0-9a-f-]{36}$/i
  )
  const query = new URL(
    state.reconciliationRequests[0]!.path,
    'http://core.local'
  ).searchParams
  expect(query.get('limit')).toBe('500')
  expect(query.get('status')).toBeNull()

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
      path: testInfo.outputPath(`finance-reconciliation-${viewport.name}.png`),
      fullPage: true,
    })
  }
})
