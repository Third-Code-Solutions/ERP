import { expect, test, type Page, type Response } from '@playwright/test'

const WEB_ORIGIN = 'http://127.0.0.1:4327'
const AUTH_ORIGIN = 'http://127.0.0.1:4328'
const PROJECT_ID = 'a6778017-a3d3-4ba5-8989-3127d75b458b'
const JOB_PATH = /^\/api\/cortex\/chat\/jobs\/[0-9a-f-]{36}$/i

type Identity =
  | 'success'
  | 'foreign'
  | 'focused'
  | 'abort'
  | 'unmount'
  | 'timeout'

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

interface BrowserEvidence {
  errors: string[]
  foreignAttempts: string[]
}

test.describe.configure({ mode: 'serial' })

async function setSession(page: Page, identity: Identity): Promise<void> {
  const response = await fetch(
    `${AUTH_ORIGIN}/__harness__/session?identity=${identity}`
  )
  expect(response.ok).toBe(true)
  const session = (await response.json()) as HarnessSession
  const sessionValue = `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: `local-${identity}-refresh-token`,
      expires_in: session.expiresAt - Math.floor(Date.now() / 1000),
      expires_at: session.expiresAt,
      token_type: 'bearer',
      user: session.user,
    })
  ).toString('base64')}`
  await page.context().clearCookies()
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
}

async function installNetworkGuard(page: Page): Promise<BrowserEvidence> {
  const evidence: BrowserEvidence = { errors: [], foreignAttempts: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.errors.push(message.text())
  })
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  await page.routeWebSocket('ws://127.0.0.1:4328/**', (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return
      const payload = JSON.parse(message)
      if (Array.isArray(payload)) {
        const [joinRef, ref, topic, event] = payload
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
    evidence.foreignAttempts.push(url.toString())
    if (url.hostname === 'api.fontshare.com' && url.pathname === '/v2/css') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      return
    }
    await route.abort('blockedbyclient')
  })
  return evidence
}

async function resetHarness(): Promise<void> {
  const response = await fetch(`${AUTH_ORIGIN}/__harness__/reset`, {
    method: 'POST',
  })
  expect(response.ok).toBe(true)
}

async function harnessPost(path: string, body: object) {
  const response = await fetch(`${AUTH_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json()) as Record<string, unknown>
  expect(response.ok, JSON.stringify(data)).toBe(true)
  return data
}

function isChatResponse(response: Response, method: string): boolean {
  const url = new URL(response.url())
  return (
    response.request().method() === method &&
    (url.pathname === '/api/cortex/chat' || JOB_PATH.test(url.pathname))
  )
}

async function sendAndComplete(
  page: Page,
  question: string
): Promise<{ jobId: string; jobPath: string; final: Response }> {
  const acceptedPromise = page.waitForResponse('**/api/cortex/chat')
  const finalPromise = page
    .waitForResponse(
      (response) =>
        isChatResponse(response, 'GET') && response.status() === 200,
      { timeout: 20_000 }
    )
    .catch(() => null)
  const composer = page.getByRole('textbox', { name: 'Message to Cortex' })
  await composer.fill(question)
  await composer.press('Enter')

  const accepted = await acceptedPromise
  expect(accepted.request().method()).toBe('POST')
  expect(
    accepted.status(),
    `${await accepted.text().catch(() => 'Unreadable Cortex response')} request=${accepted.request().postData()}`
  ).toBe(202)
  expect(accepted.headers()['cache-control']).toContain('private')
  expect(accepted.headers()['cache-control']).toContain('no-store')
  expect(accepted.headers()['retry-after']).toBe('1')
  const body = (await accepted.json()) as {
    status: string
    jobId: string
    conversationId: string
    retryAfterMs: number
  }
  expect(body).toMatchObject({ status: 'accepted', retryAfterMs: 1_000 })
  const jobPath = accepted.headers().location
  expect(jobPath).toBe(`/api/cortex/chat/jobs/${body.jobId}`)

  const pending = await page.request.get(`${WEB_ORIGIN}${jobPath}`)
  expect(pending.status()).toBe(202)
  expect(pending.headers()['cache-control']).toContain('private')
  expect(pending.headers()['cache-control']).toContain('no-store')
  expect((await pending.json()).job.status).toMatch(/queued|processing/)

  const final = await finalPromise
  expect(final).not.toBeNull()
  if (!final) throw new Error('Cortex final response was not observed.')
  expect(final.headers()['cache-control']).toContain('private')
  expect(final.headers()['cache-control']).toContain('no-store')
  await expect(
    page.locator('.cortex-msg--assistant .cortex-msg__bubble').last()
  ).toContainText(/knowledge graph|records in your knowledge graph/i)
  return { jobId: body.jobId, jobPath: jobPath!, final }
}

function decodeCitationHeader(value: string | undefined) {
  if (!value) return []
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Array<{
    nodeId: string
  }>
}

test.beforeEach(async () => {
  await resetHarness()
})

test.afterEach(async () => {
  await resetHarness()
})

test('proves 202, pending, success, citation revocation, and foreign concealment', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(60_000)
  const network = await installNetworkGuard(page)
  await setSession(page, 'success')
  await page.goto(`${WEB_ORIGIN}/cortex`, { waitUntil: 'domcontentloaded' })

  const lifecycle = await sendAndComplete(
    page,
    'proof-pending summarize the local project records'
  )
  const initialCitations = decodeCitationHeader(
    lifecycle.final.headers()['x-cortex-citations']
  )
  expect(initialCitations.length).toBeGreaterThan(0)
  await expect(page.getByText('Sources', { exact: true })).toBeVisible()

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      ),
      viewport.name
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath(`cortex-generation-${viewport.name}.png`),
      fullPage: true,
    })
  }
  const sendButton = page.getByRole('button', { name: 'Send' })
  expect((await sendButton.boundingBox())?.height).toBeGreaterThanOrEqual(44)

  const revoked = await harnessPost('/__harness__/revoke-citation', {
    jobId: lifecycle.jobId,
  })
  const afterRevocation = await page.request.get(
    `${WEB_ORIGIN}${lifecycle.jobPath}`
  )
  expect(afterRevocation.status()).toBe(200)
  const currentCitations = decodeCitationHeader(
    afterRevocation.headers()['x-cortex-citations']
  )
  expect(currentCitations.map((citation) => citation.nodeId)).not.toContain(
    revoked.nodeId
  )

  await setSession(page, 'foreign')
  const foreignRead = await page.request.get(
    `${WEB_ORIGIN}${lifecycle.jobPath}`
  )
  expect(foreignRead.status()).toBe(404)
  expect(network.errors).toEqual([])
  expect(
    network.foreignAttempts.every(
      (url) => new URL(url).hostname === 'api.fontshare.com'
    )
  ).toBe(true)
})

test('rechecks current role and focused-record context on every result read', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const network = await installNetworkGuard(page)
  await setSession(page, 'focused')
  await page.goto(
    `${WEB_ORIGIN}/cortex?refTable=projects&refId=${PROJECT_ID}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByText('Local Verification Project')).toBeVisible()
  const lifecycle = await sendAndComplete(
    page,
    'proof-focused summarize this focused project'
  )

  await harnessPost('/__harness__/role', {
    identity: 'focused',
    role: 'viewer',
  })
  const roleRevoked = await page.request.get(
    `${WEB_ORIGIN}${lifecycle.jobPath}`
  )
  expect(roleRevoked.status()).toBe(404)
  await harnessPost('/__harness__/role', {
    identity: 'focused',
    role: 'admin',
  })
  expect(
    (await page.request.get(`${WEB_ORIGIN}${lifecycle.jobPath}`)).status()
  ).toBe(200)

  await harnessPost('/__harness__/revoke-context', {
    jobId: lifecycle.jobId,
  })
  const contextRevoked = await page.request.get(
    `${WEB_ORIGIN}${lifecycle.jobPath}`
  )
  expect(contextRevoked.status()).toBe(404)
  expect(network.errors).toEqual([])
})

async function beginSlowChat(page: Page, identity: Identity, question: string) {
  const network = await installNetworkGuard(page)
  await setSession(page, identity)
  await page.goto(`${WEB_ORIGIN}/cortex`, { waitUntil: 'domcontentloaded' })
  const acceptedPromise = page.waitForResponse('**/api/cortex/chat')
  const composer = page.getByRole('textbox', { name: 'Message to Cortex' })
  await composer.fill(question)
  await composer.press('Enter')
  const accepted = await acceptedPromise
  expect(accepted.request().method()).toBe('POST')
  expect(
    accepted.status(),
    `${await accepted.text().catch(() => 'Unreadable Cortex response')} request=${accepted.request().postData()}`
  ).toBe(202)
  const body = (await accepted.json()) as { jobId: string }
  return { network, jobPath: accepted.headers().location!, jobId: body.jobId }
}

test('new chat aborts and cancels exactly once', async ({ page }) => {
  test.setTimeout(40_000)
  const requests: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      JOB_PATH.test(new URL(request.url()).pathname)
    ) {
      requests.push(request.url())
    }
  })
  const lifecycle = await beginSlowChat(
    page,
    'abort',
    'proof-abort keep this response pending'
  )
  const cancelled = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname === lifecycle.jobPath
  )
  await page.getByTitle('New chat').click()
  expect((await cancelled).status()).toBe(200)
  await page.waitForTimeout(500)
  expect(requests).toHaveLength(1)
  await expect(page.locator('.cortex-msg')).toHaveCount(0)
  expect(lifecycle.network.errors).toEqual([])
})

test('unmount aborts and cancels exactly once', async ({ page }) => {
  test.setTimeout(40_000)
  const requests: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      JOB_PATH.test(new URL(request.url()).pathname)
    ) {
      requests.push(request.url())
    }
  })
  const lifecycle = await beginSlowChat(
    page,
    'unmount',
    'proof-unmount keep this response pending'
  )
  await page.goto(`${WEB_ORIGIN}/dashboard`, {
    waitUntil: 'domcontentloaded',
  })
  await expect.poll(() => requests.length, { timeout: 5_000 }).toBe(1)
  await page.waitForTimeout(500)
  expect(requests).toHaveLength(1)
  await expect
    .poll(
      async () =>
        (await page.request.get(`${WEB_ORIGIN}${lifecycle.jobPath}`)).status(),
      { timeout: 10_000 }
    )
    .toBe(409)
  expect(lifecycle.network.errors).toEqual([])
})

test('ten-poll timeout cancels once and shows an honest error', async ({
  page,
}) => {
  test.setTimeout(50_000)
  let polls = 0
  let cancellations = 0
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (!JOB_PATH.test(pathname)) return
    if (request.method() === 'GET') polls += 1
    if (request.method() === 'DELETE') cancellations += 1
  })
  const lifecycle = await beginSlowChat(
    page,
    'timeout',
    'proof-timeout keep this response pending'
  )
  await expect(page.locator('.cortex-agent__error[role="alert"]')).toHaveText(
    'Cortex response generation timed out. Try again.',
    { timeout: 20_000 }
  )
  expect(polls).toBe(10)
  expect(cancellations).toBe(1)
  const terminal = await page.request.get(
    `${WEB_ORIGIN}${lifecycle.jobPath}`
  )
  expect(terminal.status()).toBe(409)
  expect(lifecycle.network.errors).toEqual([])
})

test.afterAll(async () => {
  const response = await fetch(`${AUTH_ORIGIN}/__harness__/evidence`)
  expect(response.ok).toBe(true)
  const evidence = (await response.json()) as {
    workerRequests: Array<{ path: string }>
    unexpectedWorkerRequests: unknown[]
    cloudCredentialsPresent: boolean
  }
  expect(
    evidence.workerRequests.every(
      (request) => request.path === '/v1/cortex/grounded-answer'
    )
  ).toBe(true)
  expect(evidence.unexpectedWorkerRequests).toEqual([])
  expect(evidence.cloudCredentialsPresent).toBe(false)
})
