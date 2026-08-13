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
  foreignBomId: string
  boms: Array<{
    id: string
    status: string
    total_cost_cents: number
    tcv_cents: number
    gp_cents: number
    gp_margin_bps: number
  }>
  bomLines: Array<{
    id: string
    bom_id: string
    description: string
    quantity: number
    unit_cost_cents: number
    markup_bps: number
    line_total_cents: number
    notes: string | null
  }>
  togalRequests: Array<{
    id: string
    bom_id: string
    idempotency_key: string
    request_hash: string
    state: string
    result: Record<string, unknown> | null
  }>
  coreRequests: Array<{
    method: string
    path: string
    authorization: string
    requestId: string
    idempotencyKey: string
    body: string
  }>
  auditEntries: Array<Record<string, unknown>>
}

test('proves Core Togal BOM commit, replay, exact totals, and tenant isolation', async ({
  page,
}) => {
  test.setTimeout(120_000)

  const unauthenticatedPage = await page.request.get(`${WEB_ORIGIN}/documents`, {
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
      refresh_token: 'local-togal-refresh-token',
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

  const pageResponse = await page.goto(`${WEB_ORIGIN}/documents`, {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()

  const stateBeforeResponse = await page.request.get(
    `${AUTH_ORIGIN}/__harness__/state`
  )
  expect(stateBeforeResponse.ok()).toBe(true)
  const before = (await stateBeforeResponse.json()) as HarnessState
  const bomId = before.boms[0]?.id
  expect(bomId).toBeTruthy()

  const command = {
    bom_id: bomId,
    proposed_lines: [
      {
        code: 'CONC-01',
        description: 'Concrete footing',
        unit: 'm3',
        qty: 2,
        unit_cost_cents: 1_000,
        markup_bps: 3_000,
        source_label: 'Togal local canary',
        notes: 'Browser canary fixture',
      },
    ],
    markup_bps: 3_000,
  }
  const idempotencyKey = 'togal-browser-canary-1'

  const first = await page.request.post(`${WEB_ORIGIN}/api/bom/togal-commit`, {
    data: command,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  const firstBody = (await first.json()) as Record<string, unknown>
  expect(first.status(), JSON.stringify(firstBody)).toBe(200)
  expect(firstBody).toEqual({
    ok: true,
    lines_created: 1,
    bom_id: bomId,
    total_cost_cents: 2_000,
    tcv_cents: 2_600,
    gp_cents: 600,
    gp_margin_bps: 2_308,
  })

  const replay = await page.request.post(`${WEB_ORIGIN}/api/bom/togal-commit`, {
    data: command,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  expect(replay.status()).toBe(200)
  await expect(replay.json()).resolves.toEqual(firstBody)

  const foreign = await page.request.post(
    `${WEB_ORIGIN}/api/bom/togal-commit`,
    {
      data: { ...command, bom_id: before.foreignBomId },
      headers: { 'Idempotency-Key': 'togal-browser-canary-foreign' },
    }
  )
  expect(foreign.status()).toBe(404)

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
        if (!response.ok()) return false
        const candidate = (await response.json()) as HarnessState
        return (
          candidate.bomLines.length === 1 &&
          candidate.togalRequests.length === 1 &&
          candidate.coreRequests.filter(
            (request) =>
              request.path === '/v1/procurement/boms/togal-commit' &&
              request.method === 'POST'
          ).length === 3
        )
      },
      { timeout: 30_000 }
    )
    .toBe(true)

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState
  expect(state.boms).toHaveLength(1)
  expect(state.boms[0]).toMatchObject({
    id: bomId,
    status: 'draft',
    total_cost_cents: 2_000,
    tcv_cents: 2_600,
    gp_cents: 600,
    gp_margin_bps: 2_308,
  })
  expect(state.bomLines).toHaveLength(1)
  expect(state.bomLines[0]).toMatchObject({
    bom_id: bomId,
    description: 'Concrete footing',
    quantity: 2,
    unit_cost_cents: 1_000,
    markup_bps: 3_000,
    line_total_cents: 2_600,
  })
  expect(state.bomLines[0]?.notes).toContain('Cost from Togal (Togal local canary)')
  expect(state.togalRequests).toHaveLength(1)
  expect(state.togalRequests[0]).toMatchObject({
    bom_id: bomId,
    idempotency_key: idempotencyKey,
    request_hash: /^[0-9a-f]{64}$/,
    state: 'succeeded',
  })
  expect(state.togalRequests[0]?.result).toEqual({
    ok: true,
    linesCreated: 1,
    bomId,
    tenantId: state.tenantId,
    totalCostCents: 2_000,
    tcvCents: 2_600,
    gpCents: 600,
    gpMarginBps: 2_308,
  })

  const togalRequests = state.coreRequests.filter(
    (request) => request.path === '/v1/procurement/boms/togal-commit'
  )
  expect(togalRequests).toHaveLength(3)
  expect(togalRequests.every((request) => request.method === 'POST')).toBe(true)
  expect(togalRequests.every((request) => request.authorization === `Bearer ${session.accessToken}`)).toBe(true)
  expect(togalRequests.every((request) => /^[0-9a-f-]{36}$/.test(request.requestId))).toBe(true)
  expect(togalRequests.map((request) => request.idempotencyKey)).toEqual([
    idempotencyKey,
    idempotencyKey,
    'togal-browser-canary-foreign',
  ])
  const postedCommands = togalRequests.map(
    (request) => JSON.parse(request.body) as Record<string, unknown>
  )
  expect(postedCommands[0]).toMatchObject({ bomId, markupBps: 3_000 })
  expect(postedCommands[1]).toEqual(postedCommands[0])
  expect(postedCommands[2]).toMatchObject({ bomId: before.foreignBomId })
  const bomAudits = state.auditEntries.filter((entry) => entry.entity_type === 'bom')
  expect(bomAudits).toHaveLength(1)
  expect(bomAudits[0]).toMatchObject({
    entity_type: 'bom',
    action: 'update',
  })
  expect(consoleErrors).toEqual([])
})
