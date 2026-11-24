import type { ErrorEvent } from '@sentry/nestjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  onUnhandledRejectionIntegration: vi.fn((options: { mode: string }) => ({
    name: 'OnUnhandledRejection',
    options,
  })),
}))
vi.mock('@sentry/nestjs', () => sentry)
const init = sentry.init

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

async function loadInstrument(): Promise<void> {
  vi.resetModules()
  await import('./instrument.js')
}

describe('Core API Sentry instrument', () => {
  beforeEach(() => {
    init.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('never initialises the SDK when SENTRY_DSN is unset', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    await loadInstrument()
    expect(init).not.toHaveBeenCalled()
  })

  it('initialises errors-only reporting tagged with the Railway release', async () => {
    vi.stubEnv('SENTRY_DSN', DSN)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'abc123')
    vi.stubEnv('APP_REVISION', 'fallback')
    await loadInstrument()

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'production',
        release: 'abc123',
        tracesSampleRate: 0,
        // Unhandled rejections still exit the process, as without Sentry.
        integrations: [
          { name: 'OnUnhandledRejection', options: { mode: 'strict' } },
        ],
      })
    )
  })

  it('scrubs auth and cookie headers and request bodies before sending', async () => {
    vi.stubEnv('SENTRY_DSN', DSN)
    await loadInstrument()
    const [{ beforeSend }] = init.mock.calls[0] as [
      { beforeSend: (event: ErrorEvent) => ErrorEvent },
    ]
    const event = {
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.example/v1/public/signatures/tok123',
        data: '{"signatureDataUrl":"data:image/png;base64,AAAA"}',
        cookies: { session: 'abc' },
        headers: {
          authorization: 'Bearer jwt',
          cookie: 'session=abc',
          'x-erp-core-webhook-token': 'secret',
          'content-type': 'application/json',
        },
      },
    } satisfies ErrorEvent

    expect(beforeSend(event).request).toEqual({
      method: 'POST',
      url: 'https://api.example/v1/public/signatures/[redacted]',
      headers: { 'content-type': 'application/json' },
    })
  })
})
