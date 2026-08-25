import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const ENABLED = process.env.E2E_CONTROLLED_UPLOAD === '1'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4327'
const AUTH_ORIGIN = 'http://127.0.0.1:4328'
const TENANT_ID = '2b2b039c-b066-412b-af4c-564f2af6097e'
const PROJECT_ID =
  process.env.E2E_PROJECT_ID ?? 'a6778017-a3d3-4ba5-8989-3127d75b458b'
const FIXTURE = resolve(
  __dirname,
  '..',
  'public',
  'samples',
  'mep-sample.dxf'
)
const PROVIDER_DIAGNOSTIC =
  'supabase-request-id=provider-secret-do-not-render'
const LOCAL_BASE_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/

interface ObservedRequests {
  signIdempotencyKeys: string[]
  storageUploads: number
  completionBodies: unknown[]
  releases: string[]
  unexpectedStorage: string[]
}

interface HarnessSession {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

function createObservedRequests(): ObservedRequests {
  return {
    signIdempotencyKeys: [],
    storageUploads: 0,
    completionBodies: [],
    releases: [],
    unexpectedStorage: [],
  }
}

function storagePathFor(reservationId: string): string {
  return `${TENANT_ID}/${PROJECT_ID}/${reservationId}-mep-sample.dxf`
}

function successfulSignResponse(reservationId: string, storagePath: string) {
  return {
    signedUrl: `${BASE_URL}/storage/v1/object/upload/sign/documents/${storagePath}`,
    token: 'controlled-storage-token',
    storagePath,
    originalFileName: 'mep-sample.dxf',
    reservationId,
  }
}

function successfulCompletionResponse(storagePath: string) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    storagePath,
    documentType: 'dxf',
    cadFormat: 'dxf',
    cadParseQueued: false,
  }
}

async function installRealtimeStub(page: Page): Promise<void> {
  await page.routeWebSocket('ws://127.0.0.1:4328/**', (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return
      let payload: unknown
      try {
        payload = JSON.parse(message)
      } catch {
        return
      }
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
      const object = payload as {
        event?: string
        join_ref?: string | null
        ref?: string | null
        topic?: string
      }
      if (object.event !== 'heartbeat' && object.event !== 'phx_join') return
      webSocket.send(
        JSON.stringify({
          event: 'phx_reply',
          join_ref: object.join_ref ?? null,
          payload: { response: {}, status: 'ok' },
          ref: object.ref ?? null,
          topic: object.topic ?? 'phoenix',
        })
      )
    })
  })
}

async function setHarnessSession(page: Page): Promise<void> {
  const response = await fetch(`${AUTH_ORIGIN}/__harness__/session`)
  expect(response.ok).toBe(true)
  const session = (await response.json()) as HarnessSession
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
      url: BASE_URL,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: session.expiresAt,
    },
  ])
}

async function openDocumentsPage(page: Page): Promise<void> {
  await installRealtimeStub(page)
  await setHarnessSession(page)
  const response = await page.goto(`/projects/${PROJECT_ID}/documents`, {
    waitUntil: 'domcontentloaded',
  })
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('documents-upload-trigger')).toBeVisible()
}

async function installStorageStub(
  page: Page,
  observed: ObservedRequests,
  storagePath: string,
  response: { status: number; body: unknown } = {
    status: 200,
    body: { Key: storagePath },
  }
): Promise<void> {
  await page.route('**/storage/v1/**', async (route) => {
    const url = route.request().url()
    if (
      route.request().method() !== 'PUT' ||
      !url.includes('/storage/v1/object/upload/sign/') ||
      !decodeURIComponent(url).includes(storagePath)
    ) {
      observed.unexpectedStorage.push(url)
      await route.abort()
      return
    }

    observed.storageUploads += 1
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    })
  })
}

async function selectFixture(page: Page): Promise<void> {
  const trigger = page.getByTestId('documents-upload-trigger')
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const chooserPromise = page.waitForEvent('filechooser', {
        timeout: 1_500,
      })
      await trigger.click()
      const chooser = await chooserPromise
      await chooser.setFiles(FIXTURE)
      return
    } catch (error) {
      if (attempt === 10) throw error
      await page.waitForTimeout(250)
    }
  }
}

async function expectProviderDiagnosticsHidden(
  page: Page,
  consoleMessages: string[]
): Promise<void> {
  await expect(page.locator('body')).not.toContainText(PROVIDER_DIAGNOSTIC)
  expect(consoleMessages.join('\n')).not.toContain(PROVIDER_DIAGNOSTIC)
}

test.describe('controlled project document reservation upload', () => {
  test.describe.configure({ timeout: 90_000 })
  test.skip(!ENABLED, 'Set E2E_CONTROLLED_UPLOAD=1 to enable this local fixture.')
  test.skip(
    !LOCAL_BASE_URL.test(BASE_URL),
    'Controlled upload fixture only runs against localhost/127.0.0.1.'
  )

  test('completes a selected reservation with one signed Storage upload', async ({
    page,
  }) => {
    const reservationId = '11111111-1111-4111-8111-111111111111'
    const storagePath = storagePathFor(reservationId)
    const observed = createObservedRequests()
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))

    await openDocumentsPage(page)
    await installStorageStub(page, observed, storagePath)
    await page.route('**/api/upload/sign', async (route) => {
      const idempotencyKey = await route.request().headerValue('idempotency-key')
      observed.signIdempotencyKeys.push(idempotencyKey ?? '')
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        projectId?: string
        fileName?: string
        sizeBytes?: number
      }
      expect(body).toMatchObject({
        projectId: PROJECT_ID,
        fileName: 'mep-sample.dxf',
      })
      expect(body.sizeBytes).toBeGreaterThan(0)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulSignResponse(reservationId, storagePath)),
      })
    })
    await page.route('**/api/upload/complete', async (route) => {
      observed.completionBodies.push(
        JSON.parse(route.request().postData() ?? '{}')
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulCompletionResponse(storagePath)),
      })
    })

    await selectFixture(page)

    await expect(page.getByText('DXF uploaded', { exact: true })).toBeVisible()
    expect(observed.signIdempotencyKeys).toHaveLength(1)
    expect(observed.signIdempotencyKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(observed.storageUploads).toBe(1)
    expect(observed.completionBodies).toEqual([{ reservationId }])
    expect(observed.unexpectedStorage).toEqual([])
    await expectProviderDiagnosticsHidden(page, consoleMessages)
  })

  test('reuses the same Idempotency-Key when signing the same file is retried', async ({
    page,
  }) => {
    const reservationId = '22222222-2222-4222-8222-222222222222'
    const storagePath = storagePathFor(reservationId)
    const observed = createObservedRequests()
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))

    await openDocumentsPage(page)
    await installStorageStub(page, observed, storagePath)
    await page.route('**/api/upload/sign', async (route) => {
      const idempotencyKey = await route.request().headerValue('idempotency-key')
      observed.signIdempotencyKeys.push(idempotencyKey ?? '')
      if (observed.signIdempotencyKeys.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Upload signing is temporarily unavailable',
            providerDiagnostics: PROVIDER_DIAGNOSTIC,
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulSignResponse(reservationId, storagePath)),
      })
    })
    await page.route('**/api/upload/complete', async (route) => {
      observed.completionBodies.push(
        JSON.parse(route.request().postData() ?? '{}')
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulCompletionResponse(storagePath)),
      })
    })

    await selectFixture(page)
    await expect(
      page.getByRole('alert').filter({
        hasText: 'Upload signing is temporarily unavailable',
      })
    ).toBeVisible()
    await expectProviderDiagnosticsHidden(page, consoleMessages)

    await selectFixture(page)

    await expect(page.getByText('DXF uploaded', { exact: true })).toBeVisible()
    expect(observed.signIdempotencyKeys).toHaveLength(2)
    expect(observed.signIdempotencyKeys[0]).not.toBe('')
    expect(observed.signIdempotencyKeys[1]).toBe(
      observed.signIdempotencyKeys[0]
    )
    expect(observed.storageUploads).toBe(1)
    expect(observed.completionBodies).toEqual([{ reservationId }])
    expect(observed.unexpectedStorage).toEqual([])
    await expectProviderDiagnosticsHidden(page, consoleMessages)
  })

  test('retries reservation completion without uploading the object again', async ({
    page,
  }) => {
    const reservationId = '33333333-3333-4333-8333-333333333333'
    const storagePath = storagePathFor(reservationId)
    const observed = createObservedRequests()
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))

    await openDocumentsPage(page)
    await installStorageStub(page, observed, storagePath)
    await page.route('**/api/upload/sign', async (route) => {
      observed.signIdempotencyKeys.push(
        (await route.request().headerValue('idempotency-key')) ?? ''
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulSignResponse(reservationId, storagePath)),
      })
    })
    await page.route('**/api/upload/complete', async (route) => {
      observed.completionBodies.push(
        JSON.parse(route.request().postData() ?? '{}')
      )
      if (observed.completionBodies.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Unable to finalize upload',
            providerDiagnostics: PROVIDER_DIAGNOSTIC,
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulCompletionResponse(storagePath)),
      })
    })

    await selectFixture(page)
    const retryButton = page.getByRole('button', {
      name: 'Retry finalization',
    })
    await expect(retryButton).toBeVisible()
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to finalize upload' })
    ).toBeVisible()
    await expectProviderDiagnosticsHidden(page, consoleMessages)

    await retryButton.click()

    await expect(page.getByText('DXF uploaded', { exact: true })).toBeVisible()
    expect(observed.signIdempotencyKeys).toHaveLength(1)
    expect(observed.storageUploads).toBe(1)
    expect(observed.completionBodies).toEqual([
      { reservationId },
      { reservationId },
    ])
    expect(observed.unexpectedStorage).toEqual([])
    await expectProviderDiagnosticsHidden(page, consoleMessages)
  })

  test('explicitly releases a reservation after completion fails', async ({
    page,
  }) => {
    const reservationId = '55555555-5555-4555-8555-555555555555'
    const storagePath = storagePathFor(reservationId)
    const observed = createObservedRequests()

    await openDocumentsPage(page)
    await installStorageStub(page, observed, storagePath)
    await page.route('**/api/upload/sign', async (route) => {
      observed.signIdempotencyKeys.push(
        (await route.request().headerValue('idempotency-key')) ?? ''
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulSignResponse(reservationId, storagePath)),
      })
    })
    await page.route('**/api/upload/complete', async (route) => {
      observed.completionBodies.push(
        JSON.parse(route.request().postData() ?? '{}')
      )
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to finalize upload' }),
      })
    })
    await page.route('**/api/upload/reservations/*', async (route) => {
      expect(route.request().method()).toBe('DELETE')
      observed.releases.push(
        decodeURIComponent(
          new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
        )
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ released: true }),
      })
    })

    await selectFixture(page)
    const cancelButton = page.getByRole('button', { name: 'Cancel upload' })
    await expect(cancelButton).toBeVisible()
    await cancelButton.click()

    await expect(
      page.getByTestId('documents-upload-trigger')
    ).toHaveText('Upload file')
    await expect(page.getByTestId('documents-upload-trigger')).toBeEnabled()
    await expect(cancelButton).toHaveCount(0)
    expect(observed.releases).toEqual([reservationId])
    expect(observed.storageUploads).toBe(1)
    expect(observed.completionBodies).toEqual([{ reservationId }])
    expect(observed.unexpectedStorage).toEqual([])
  })

  test('retains cleanup retry controls and renews signing identity after cleanup', async ({
    page,
  }) => {
    const reservationId = '66666666-6666-4666-8666-666666666666'
    const storagePath = storagePathFor(reservationId)
    const retryReservationId = '77777777-7777-4777-8777-777777777777'
    const retryStoragePath = storagePathFor(retryReservationId)
    const observed = createObservedRequests()
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))

    await openDocumentsPage(page)
    await page.route('**/storage/v1/**', async (route) => {
      const url = decodeURIComponent(route.request().url())
      if (
        route.request().method() !== 'PUT' ||
        !url.includes('/storage/v1/object/upload/sign/') ||
        (!url.includes(storagePath) && !url.includes(retryStoragePath))
      ) {
        observed.unexpectedStorage.push(route.request().url())
        await route.abort()
        return
      }

      observed.storageUploads += 1
      const isInitialUpload = url.includes(storagePath)
      await route.fulfill({
        status: isInitialUpload ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isInitialUpload
            ? {
                message: 'Provider upload failed',
                providerDiagnostics: PROVIDER_DIAGNOSTIC,
              }
            : { Key: retryStoragePath }
        ),
      })
    })
    await page.route('**/api/upload/sign', async (route) => {
      observed.signIdempotencyKeys.push(
        (await route.request().headerValue('idempotency-key')) ?? ''
      )
      const isRetry = observed.signIdempotencyKeys.length === 2
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          successfulSignResponse(
            isRetry ? retryReservationId : reservationId,
            isRetry ? retryStoragePath : storagePath
          )
        ),
      })
    })
    await page.route('**/api/upload/complete', async (route) => {
      observed.completionBodies.push(
        JSON.parse(route.request().postData() ?? '{}')
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulCompletionResponse(retryStoragePath)),
      })
    })
    await page.route('**/api/upload/reservations/*', async (route) => {
      expect(route.request().method()).toBe('DELETE')
      observed.releases.push(
        decodeURIComponent(
          new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
        )
      )
      const cleanupSucceeded = observed.releases.length === 3
      await route.fulfill(
        cleanupSucceeded
          ? {
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ released: true }),
            }
          : {
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Reservation cleanup is pending',
                providerDiagnostics: PROVIDER_DIAGNOSTIC,
              }),
            }
      )
    })

    await selectFixture(page)

    const cancelButton = page.getByRole('button', { name: 'Cancel upload' })
    await expect(
      page.getByRole('alert').filter({
        hasText:
          'Storage upload failed. Try again. Reservation cleanup is pending.',
      })
    ).toBeVisible()
    await expect(cancelButton).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Retry finalization' })
    ).toHaveCount(0)
    await expectProviderDiagnosticsHidden(page, consoleMessages)

    await cancelButton.click()

    await expect(
      page.getByRole('alert').filter({
        hasText: 'Reservation cleanup is pending',
      })
    ).toBeVisible()
    await expect(cancelButton).toBeVisible()
    await expect(cancelButton).toBeEnabled()
    expect(observed.signIdempotencyKeys).toHaveLength(1)
    expect(observed.storageUploads).toBe(1)
    expect(observed.completionBodies).toEqual([])
    expect(observed.releases).toEqual([reservationId, reservationId])
    await expectProviderDiagnosticsHidden(page, consoleMessages)

    await cancelButton.click()
    await expect(
      page.getByTestId('documents-upload-trigger')
    ).toHaveText('Upload file')
    expect(observed.releases).toEqual([
      reservationId,
      reservationId,
      reservationId,
    ])

    await selectFixture(page)

    await expect(page.getByText('DXF uploaded', { exact: true })).toBeVisible()
    expect(observed.signIdempotencyKeys).toHaveLength(2)
    expect(observed.signIdempotencyKeys[1]).not.toBe(
      observed.signIdempotencyKeys[0]
    )
    expect(observed.storageUploads).toBe(2)
    expect(observed.completionBodies).toEqual([
      { reservationId: retryReservationId },
    ])
    expect(observed.unexpectedStorage).toEqual([])
    await expectProviderDiagnosticsHidden(page, consoleMessages)
  })
})
