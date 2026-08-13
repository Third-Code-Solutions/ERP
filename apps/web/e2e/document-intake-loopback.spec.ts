import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const AUTH_ORIGIN = 'http://127.0.0.1:4418'
const WEB_ORIGIN = 'http://127.0.0.1:4417'

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface HarnessState {
  tenantId: string
  projectId: string
  documents: Array<{
    id: string
    file_name: string
    storage_path: string
    document_type: string
    size_bytes: number
  }>
  intakeRequests: Array<{
    id: string
    project_id: string
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
    body: string
  }>
  auditEntries: Array<Record<string, unknown>>
}

test('proves Core document intake, idempotent replay, and foreign-path rejection', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)

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
      refresh_token: 'local-document-intake-refresh-token',
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
  const storagePath = `${before.tenantId}/${before.projectId}/notes.txt`
  const command = {
    storagePath,
    projectId: before.projectId,
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    sizeBytes: 1_024,
    description: 'Core intake canary note',
  }

  const first = await page.request.post(`${WEB_ORIGIN}/api/upload/complete`, {
    data: command,
  })
  const firstBody = (await first.json()) as Record<string, unknown>
  expect(first.status(), JSON.stringify(firstBody)).toBe(200)
  expect(firstBody).toMatchObject({
    storagePath,
    documentType: 'other',
    cadFormat: null,
    cadParseQueued: false,
  })

  const replay = await page.request.post(`${WEB_ORIGIN}/api/upload/complete`, {
    data: command,
  })
  expect(replay.status()).toBe(200)
  const replayBody = (await replay.json()) as Record<string, unknown>
  expect(replayBody).toEqual(firstBody)

  const foreign = await page.request.post(
    `${WEB_ORIGIN}/api/upload/complete`,
    {
      data: {
        ...command,
        storagePath: `${randomUUID()}/${before.projectId}/foreign.txt`,
        fileName: 'foreign.txt',
      },
    }
  )
  expect(foreign.status()).toBe(403)

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
        if (!response.ok()) return false
        const candidate = (await response.json()) as HarnessState
        return (
          candidate.documents.length === 1 &&
          candidate.intakeRequests.length === 1 &&
          candidate.coreRequests.filter(
            (request) => request.path === '/v1/documents' && request.method === 'POST'
          ).length === 2
        )
      },
      { timeout: 30_000 }
    )
    .toBe(true)

  const stateResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(stateResponse.ok()).toBe(true)
  const state = (await stateResponse.json()) as HarnessState
  expect(state.documents).toHaveLength(1)
  expect(state.documents[0]).toMatchObject({
    file_name: 'notes.txt',
    storage_path: storagePath,
    document_type: 'other',
    size_bytes: 1_024,
  })
  expect(state.intakeRequests).toHaveLength(1)
  expect(state.intakeRequests[0]).toMatchObject({
    project_id: before.projectId,
    state: 'succeeded',
    request_hash: /^[0-9a-f]{64}$/,
  })
  expect(state.intakeRequests[0]?.result).toMatchObject({
    documentId: firstBody.id,
    created: true,
  })

  const documentRequests = state.coreRequests.filter(
    (request) => request.path === '/v1/documents'
  )
  expect(documentRequests).toHaveLength(2)
  expect(documentRequests.every((request) => request.authorization === `Bearer ${session.accessToken}`)).toBe(true)
  expect(documentRequests.every((request) => /^[0-9a-f-]{36}$/.test(request.requestId))).toBe(true)
  expect(documentRequests.map((request) => JSON.parse(request.body))).toEqual([
    expect.objectContaining(command),
    expect.objectContaining(command),
  ])
  expect(state.auditEntries.filter((entry) => entry.entity_type === 'document')).toHaveLength(1)
  expect(consoleErrors).toEqual([])
})
