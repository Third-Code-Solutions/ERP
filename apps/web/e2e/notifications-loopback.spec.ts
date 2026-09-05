import { expect, test } from '@playwright/test'

const AUTH_ORIGIN = 'http://127.0.0.1:4418'
const WEB_ORIGIN = 'http://127.0.0.1:4417'

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface HarnessState {
  tenantId: string
  userId: string
  notifications: Array<{
    id: string
    subject: string
    is_read: boolean
    read_at: string | null
  }>
  foreignNotificationIsRead: boolean
  coreRequests: Array<{
    method: string
    path: string
    authorization: string
    requestId: string
    body: string
  }>
  auditEntries: Array<Record<string, unknown>>
}

test('proves Core notification authority and tenant isolation', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(`${WEB_ORIGIN}/settings`, {
    maxRedirects: 0,
  })
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
      refresh_token: 'local-notification-refresh-token',
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

  await page.routeWebSocket('ws://127.0.0.1:4418/**', (webSocket) => {
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

  const pageResponse = await page.goto(`${WEB_ORIGIN}/settings`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const notificationButton = page.getByRole('button', {
    name: /^Notifications(?: \(\d+ unread\))?$/,
  })
  await expect(notificationButton).toBeVisible({ timeout: 30_000 })

  const beforeOpenStateResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(beforeOpenStateResponse.ok()).toBe(true)
  const beforeOpenState = (await beforeOpenStateResponse.json()) as HarnessState
  expect(
    beforeOpenState.coreRequests.filter(
      (request) => request.path === '/v1/notifications'
    )
  ).toHaveLength(0)

  const preferencesForm = page.getByRole('form', { name: 'Notification preferences' })
  await preferencesForm.getByLabel('Default inbox view').selectOption('unread')
  await preferencesForm.getByLabel('Automatically refresh notifications').uncheck()
  await preferencesForm.getByRole('button', { name: 'Save notification preferences' }).click()
  await expect(preferencesForm.getByRole('status')).toHaveText('Notification preferences saved.')
  await page.reload()
  await expect(preferencesForm.getByLabel('Default inbox view')).toHaveValue('unread')
  await expect(preferencesForm.getByLabel('Automatically refresh notifications')).not.toBeChecked()
  await notificationButton.click()
  const unreadDialog = page.getByRole('dialog', { name: 'Notifications' })
  await expect(unreadDialog.getByText('Unread follow-up', { exact: true })).toBeVisible()
  await expect(unreadDialog.getByText('Already seen', { exact: true })).toHaveCount(0)
  await expect(unreadDialog.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await preferencesForm.getByLabel('Default inbox view').selectOption('all')
  await preferencesForm.getByLabel('Automatically refresh notifications').check()
  await preferencesForm.getByRole('button', { name: 'Save notification preferences' }).click()
  await expect(preferencesForm.getByRole('status')).toHaveText('Notification preferences saved.')
  await page.reload()
  await expect(preferencesForm.getByLabel('Default inbox view')).toHaveValue('all')

  const finance = page.getByRole('region', { name: 'Project invoices and payments' })
  await expect(finance.getByRole('link', { name: 'Project invoices', exact: true })).toHaveAttribute('href', '/invoices')
  await expect(finance.getByRole('link', { name: 'Record a payment' })).toHaveAttribute('href', '/finance/cash/new')
  await expect(page.getByRole('region', { name: 'Integrations' })).toContainText('This is not a live connectivity test')

  await notificationButton.click()

  const dialog = page.getByRole('dialog', { name: 'Notifications' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Core notification authority', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Unread follow-up', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Already seen', { exact: true })).toBeVisible()
  await expect(dialog.getByText('2 unread in recent notifications', { exact: true })).toBeVisible()
  await expect(notificationButton).toHaveAccessibleName('Notifications (2 unread)')

  await dialog.getByRole('button', { name: 'Mark read' }).first().click()
  await expect(dialog.getByText('1 unread in recent notifications', { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'Mark all read' }).click()
  await expect(dialog.getByText('No unread in recent notifications', { exact: true })).toBeVisible()

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
        if (!response.ok()) return false
        const candidate = (await response.json()) as HarnessState
        return (
          candidate.notifications.every((item) => item.is_read) &&
          candidate.coreRequests.filter(
            (request) => request.path === '/v1/notifications' && request.method === 'POST'
          ).length === 2
        )
      },
      { timeout: 30_000 }
    )
    .toBe(true)

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState

  expect(state.notifications).toHaveLength(3)
  expect(state.notifications.every((item) => item.is_read)).toBe(true)
  expect(
    state.notifications
      .filter((item) => item.subject !== 'Already seen')
      .every((item) => item.read_at)
  ).toBe(true)
  expect(state.foreignNotificationIsRead).toBe(false)

  const notificationRequests = state.coreRequests.filter(
    (request) => request.path === '/v1/notifications'
  )
  expect(notificationRequests.length).toBeGreaterThanOrEqual(3)
  expect(notificationRequests.every((request) => request.authorization === `Bearer ${session.accessToken}`)).toBe(true)
  expect(notificationRequests.every((request) => /^[0-9a-f-]{36}$/.test(request.requestId))).toBe(true)

  const commands = notificationRequests
    .filter((request) => request.method === 'POST')
    .map((request) => JSON.parse(request.body) as Record<string, unknown>)
  expect(commands).toEqual([
    expect.objectContaining({ action: 'mark_read' }),
    { action: 'mark_all_read' },
  ])

  expect(state.auditEntries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entity_type: 'notification',
        action: 'update',
      }),
      expect.objectContaining({
        entity_type: 'notification_recipient',
        action: 'update',
      }),
    ])
  )
  expect(consoleErrors).toEqual([])
  expect(blockedExternalRequests).toEqual([])

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'laptop', width: 1024, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'small-mobile', width: 320, height: 760 },
  ]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow, viewport.name).toBeLessThanOrEqual(1)
    const dialogBounds = await dialog.boundingBox()
    expect(dialogBounds).not.toBeNull()
    expect(dialogBounds!.x, `${viewport.name}: left edge`).toBeGreaterThanOrEqual(0)
    expect(dialogBounds!.x + dialogBounds!.width, `${viewport.name}: right edge`).toBeLessThanOrEqual(viewport.width)
    await page.screenshot({
      path: testInfo.outputPath(`notifications-${viewport.name}.png`),
      fullPage: true,
    })
  }
})
