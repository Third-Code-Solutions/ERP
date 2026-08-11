import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const AUTH_ORIGIN = 'http://127.0.0.1:4348'
const WEB_ORIGIN = 'http://127.0.0.1:4347'

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface HarnessState {
  userId: string
  tenantId: string
  cashAccountId: string
  signRequests: Array<{
    storagePath: string
    token: string
  }>
  uploadRequests: Array<{
    storagePath: string
    token: string
    bytes: number
  }>
  storageReadRequests: Array<{
    storagePath: string
    token: string
    method: string
    authorization?: string
  }>
  removeRequests: Array<{
    prefixes: string[]
  }>
  foreignRequests: Array<Record<string, unknown>>
  bankStatementCount: number
  bankStatementLineCount: number
  importRequestCount: number
  auditCount: number
  auditEntries: Array<Record<string, unknown>>
}

test('proves successful Core bank-statement import, detail rendering, and cross-tenant cleanup denial', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(
    `${WEB_ORIGIN}/finance/reconciliation/new`,
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
      refresh_token: 'local-bank-import-refresh-token',
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
  await page.routeWebSocket('ws://127.0.0.1:4348/**', (webSocket) => {
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

  const pageResponse = await page.goto(
    `${WEB_ORIGIN}/finance/reconciliation/new`,
    { waitUntil: 'domcontentloaded' }
  )
  expect(pageResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Import bank statement', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Secure Storage handoff is enabled for this tenant.', {
      exact: false,
    })
  ).toBeVisible()

  await page.locator('#statement-reference').fill('CONTROLLED-001')
  await page.locator('#statement-start').fill('2026-08-01')
  await page.locator('#statement-end').fill('2026-08-31')
  await page.locator('#statement-opening').fill('100.00')
  await page.locator('#statement-closing').fill('125.00')
  await page.locator('#statement-csv').setInputFiles({
    name: 'controlled.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'date,reference,description,amount\n2026-08-15,CONTROLLED-1,Controlled canary,25.00\n',
      'utf8'
    ),
  })
  await expect(
    page.getByRole('button', { name: 'Import statement draft' })
  ).toBeEnabled()

  await page.getByRole('button', { name: 'Import statement draft' }).click()
  await expect(page).toHaveURL(
    new RegExp('/finance/reconciliation/[0-9a-f-]{36}$'),
    { timeout: 30_000 }
  )
  await expect(
    page.getByRole('heading', { name: 'CONTROLLED-001', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Imported file evidence' })).toBeVisible()
  await expect(page.getByText('controlled.csv', { exact: true })).toBeVisible()
  await expect(page.getByText('Validated roll-forward', { exact: true })).toBeVisible()
  await expect(page.getByText('0 / 1', { exact: true })).toBeVisible()

  const foreignCleanup = await page.request.delete(
    `${WEB_ORIGIN}/api/finance/reconciliation/import/sign`,
    {
      data: {
        storagePath: `${randomUUID()}/bank-statements/foreign.csv`,
      },
    }
  )
  expect(foreignCleanup.status()).toBe(403)

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState

  expect(state.signRequests).toHaveLength(1)
  expect(state.uploadRequests).toHaveLength(1)
  expect(state.storageReadRequests).toHaveLength(2)
  expect(state.removeRequests).toHaveLength(0)
  expect(state.foreignRequests).toEqual([])
  expect(state.bankStatementCount).toBe(1)
  expect(state.bankStatementLineCount).toBe(1)
  expect(state.importRequestCount).toBe(1)
  const uploadAudits = state.auditEntries.filter(
    (entry) => entry.entity_type === 'bank_statement_upload'
  )
  expect(uploadAudits).toHaveLength(1)
  expect(uploadAudits.map((entry) => entry.action)).toEqual(['query'])

  const storagePath = state.signRequests[0]!.storagePath
  expect(storagePath).toMatch(
    new RegExp(`^${state.tenantId}/bank-statements/[0-9a-f-]+-controlled\\.csv$`)
  )
  expect(state.uploadRequests[0]).toMatchObject({
    storagePath,
    token: state.signRequests[0]!.token,
  })
  expect(state.uploadRequests[0]!.bytes).toBeGreaterThan(0)
  expect(state.storageReadRequests[0]).toMatchObject({
    storagePath,
    method: 'sign',
  })
  expect(state.storageReadRequests[0]!.authorization).toBe(
    `Bearer ${'third-code-local-service-role-key'}`
  )
  expect(state.storageReadRequests[1]).toMatchObject({
    storagePath,
    method: 'read',
  })

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
      path: testInfo.outputPath(`bank-statement-storage-${viewport.name}.png`),
      fullPage: true,
    })
  }
})
