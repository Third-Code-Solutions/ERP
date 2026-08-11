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
  reconciliationDetailRequests: Array<{
    path: string
    authorization: string
    requestId: string
  }>
  reconciliationWorkflowRequests: Array<{
    method: string
    path: string
    authorization: string
    idempotencyKey: string
    requestId: string
    body: string
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

  const draftLink = page.getByRole('link', {
    name: 'ST-LOOPBACK-RECON-DRAFT',
    exact: true,
  })
  const draftHref = await draftLink.getAttribute('href')
  expect(draftHref).toMatch(/^\/finance\/reconciliation\/[0-9a-f-]+$/i)
  const detailResponse = await page.goto(`${WEB_ORIGIN}${draftHref}`, {
    waitUntil: 'domcontentloaded',
  })
  expect(detailResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'ST-LOOPBACK-RECON-DRAFT', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Imported file evidence', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Line-by-line proof', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('Customer deposit', { exact: true })).toBeVisible()
  await expect(page.getByText('Bank service fee', { exact: true })).toBeVisible()
  await expect(page.getByText('0 / 2', { exact: true })).toBeVisible()

  const detailStateResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(detailStateResponse.ok()).toBe(true)
  const detailSnapshot = (await detailStateResponse.json()) as HarnessState
  expect(detailSnapshot.reconciliationDetailRequests).toHaveLength(1)
  expect(detailSnapshot.reconciliationDetailRequests[0]?.path).toBe(
    draftHref?.replace('/finance/reconciliation/', '/v1/finance/reconciliation/')
  )
  expect(detailSnapshot.reconciliationDetailRequests[0]?.authorization).toBe(
    `Bearer ${session.accessToken}`
  )
  expect(detailSnapshot.reconciliationDetailRequests[0]?.requestId).toMatch(
    /^[0-9a-f-]{36}$/i
  )

  await page.getByRole('button', { name: 'Run exact auto-match' }).click()
  await expect(page.locator('p[role="status"]')).toHaveText(
    '0 exact matches added; 2 exceptions remain.'
  )
  const workflowStateResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(workflowStateResponse.ok()).toBe(true)
  const workflowSnapshot = (await workflowStateResponse.json()) as HarnessState
  expect(workflowSnapshot.reconciliationWorkflowRequests).toHaveLength(1)
  expect(workflowSnapshot.reconciliationWorkflowRequests[0]).toMatchObject({
    method: 'POST',
    path: `${draftHref?.replace('/finance/reconciliation/', '/v1/finance/reconciliation/')}/auto-match`,
    authorization: `Bearer ${session.accessToken}`,
    body: '{}',
  })
  expect(
    workflowSnapshot.reconciliationWorkflowRequests[0]?.idempotencyKey
  ).toMatch(/^auto-match-[0-9a-f-]{36}$/i)
  expect(
    workflowSnapshot.reconciliationWorkflowRequests[0]?.requestId
  ).toMatch(/^[0-9a-f-]{36}$/i)

  const seedMatchResponse = await page.request.post(
    `${AUTH_ORIGIN}/__harness__/seed-line-match`
  )
  expect(seedMatchResponse.ok()).toBe(true)
  const seededMatch = (await seedMatchResponse.json()) as {
    cashTransactionId: string
    secondCashTransactionId: string
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  const firstLine = page.locator('tbody tr').first()
  await firstLine.locator('select').selectOption(seededMatch.cashTransactionId)
  await firstLine.getByRole('button', { name: 'Match' }).click()
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible()

  const matchedWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(matchedWorkflowResponse.ok()).toBe(true)
  const matchedWorkflowState =
    (await matchedWorkflowResponse.json()) as HarnessState
  expect(matchedWorkflowState.reconciliationWorkflowRequests).toHaveLength(2)
  expect(
    matchedWorkflowState.reconciliationWorkflowRequests[1]
  ).toMatchObject({
    method: 'POST',
    path: /\/lines\/[0-9a-f-]+\/match$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: JSON.stringify({ cashTransactionId: seededMatch.cashTransactionId }),
  })
  expect(
    matchedWorkflowState.reconciliationWorkflowRequests[1]?.idempotencyKey
  ).toMatch(/^line-match-[0-9a-f-]{36}$/i)

  await page.locator('tbody tr').first().getByRole('button', { name: 'Unmatch' }).click()
  await expect(page.getByText('0 / 2', { exact: true })).toBeVisible()
  const unmatchedWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(unmatchedWorkflowResponse.ok()).toBe(true)
  const unmatchedWorkflowState =
    (await unmatchedWorkflowResponse.json()) as HarnessState
  expect(unmatchedWorkflowState.reconciliationWorkflowRequests).toHaveLength(3)
  expect(
    unmatchedWorkflowState.reconciliationWorkflowRequests[2]
  ).toMatchObject({
    method: 'POST',
    path: /\/lines\/[0-9a-f-]+\/unmatch$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: '{}',
  })
  expect(
    unmatchedWorkflowState.reconciliationWorkflowRequests[2]?.idempotencyKey
  ).toMatch(/^line-unmatch-[0-9a-f-]{36}$/i)

  await firstLine.locator('select').selectOption(seededMatch.cashTransactionId)
  await firstLine.getByRole('button', { name: 'Match' }).click()
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible()
  const rematchedWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(rematchedWorkflowResponse.ok()).toBe(true)
  const rematchedWorkflowState =
    (await rematchedWorkflowResponse.json()) as HarnessState
  expect(rematchedWorkflowState.reconciliationWorkflowRequests).toHaveLength(4)
  expect(
    rematchedWorkflowState.reconciliationWorkflowRequests[3]
  ).toMatchObject({
    method: 'POST',
    path: /\/lines\/[0-9a-f-]+\/match$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: JSON.stringify({ cashTransactionId: seededMatch.cashTransactionId }),
  })
  expect(
    rematchedWorkflowState.reconciliationWorkflowRequests[3]?.idempotencyKey
  ).toMatch(/^line-match-[0-9a-f-]{36}$/i)

  const secondLine = page.locator('tbody tr').nth(1)
  await secondLine
    .locator('select')
    .selectOption(seededMatch.secondCashTransactionId)
  await secondLine.getByRole('button', { name: 'Match' }).click()
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible()
  const fullyMatchedWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(fullyMatchedWorkflowResponse.ok()).toBe(true)
  const fullyMatchedWorkflowState =
    (await fullyMatchedWorkflowResponse.json()) as HarnessState
  expect(fullyMatchedWorkflowState.reconciliationWorkflowRequests).toHaveLength(5)
  expect(
    fullyMatchedWorkflowState.reconciliationWorkflowRequests[4]
  ).toMatchObject({
    method: 'POST',
    path: /\/lines\/[0-9a-f-]+\/match$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: JSON.stringify({
      cashTransactionId: seededMatch.secondCashTransactionId,
    }),
  })
  expect(
    fullyMatchedWorkflowState.reconciliationWorkflowRequests[4]?.idempotencyKey
  ).toMatch(/^line-match-[0-9a-f-]{36}$/i)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reconcile statement' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'ST-LOOPBACK-RECON-DRAFT',
      exact: true,
    })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Void reconciliation', exact: true })
  ).toBeVisible()
  const reconciledWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(reconciledWorkflowResponse.ok()).toBe(true)
  const reconciledWorkflowState =
    (await reconciledWorkflowResponse.json()) as HarnessState
  expect(reconciledWorkflowState.reconciliationWorkflowRequests).toHaveLength(6)
  expect(
    reconciledWorkflowState.reconciliationWorkflowRequests[5]
  ).toMatchObject({
    method: 'POST',
    path: /\/reconcile$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: '{}',
  })
  expect(
    reconciledWorkflowState.reconciliationWorkflowRequests[5]?.idempotencyKey
  ).toMatch(/^reconcile-[0-9a-f-]{36}$/i)

  await page.getByLabel('Void reason').fill('Imported wrong institution period')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Void reconciliation', exact: true }).click()
  await expect(
    page.getByText(
      'Voided reconciliation. Source lines and original match evidence remain immutable and queryable.',
      { exact: true }
    )
  ).toBeVisible()

  const voidedWorkflowResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(voidedWorkflowResponse.ok()).toBe(true)
  const voidedWorkflowState =
    (await voidedWorkflowResponse.json()) as HarnessState
  expect(voidedWorkflowState.reconciliationWorkflowRequests).toHaveLength(7)
  expect(voidedWorkflowState.reconciliationWorkflowRequests[6]).toMatchObject({
    method: 'POST',
    path: /\/void$/i,
    authorization: `Bearer ${session.accessToken}`,
    body: JSON.stringify({ reason: 'Imported wrong institution period' }),
  })
  expect(
    voidedWorkflowState.reconciliationWorkflowRequests[6]?.idempotencyKey
  ).toMatch(/^void-[0-9a-f-]{36}$/i)
  expect(
    voidedWorkflowState.reconciliationWorkflowRequests[6]?.requestId
  ).toMatch(/^[0-9a-f-]{36}$/i)

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
