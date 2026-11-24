import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ErrorEvent } from '@sentry/nestjs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The real SDK, with init captured and the two integration factories spied on.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn(),
  onUnhandledRejectionIntegration: vi.fn(),
}))
vi.mock('@sentry/nestjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/nestjs')>()
  sentry.httpIntegration.mockImplementation(actual.httpIntegration)
  sentry.onUnhandledRejectionIntegration.mockImplementation(actual.onUnhandledRejectionIntegration)
  return { ...actual, ...sentry }
})
const init = sentry.init

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

async function loadInstrument(): Promise<void> {
  vi.resetModules()
  await import('./instrument.js')
}

describe('Core API Sentry instrument', () => {
  // The first load of the real SDK takes seconds; keep it out of each test's timeout.
  beforeAll(async () => {
    await vi.importActual('@sentry/nestjs')
  }, 60_000)

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
        sendClientReports: false,
      })
    )
  })

  it('keeps the Nest SDK defaults minus every session, with strict rejections', async () => {
    vi.stubEnv('SENTRY_DSN', DSN)
    await loadInstrument()
    const actual = await vi.importActual<typeof import('@sentry/nestjs')>('@sentry/nestjs')
    const defaults = actual.getDefaultIntegrations({}) ?? []
    const [{ integrations }] = init.mock.calls[0] as [
      { integrations: (defaults: { name: string }[]) => { name: string }[] },
    ]
    const names = integrations(defaults).map(({ name }) => name)

    expect(defaults.map(({ name }) => name)).toEqual(expect.arrayContaining(['Nest', 'Http', 'ProcessSession']))
    expect(names.filter((name) => /session/i.test(name))).toEqual([])
    expect(names.filter((name) => name === 'Http')).toHaveLength(1)
    expect(names.filter((name) => name === 'OnUnhandledRejection')).toHaveLength(1)
    expect(names).toContain('Nest')
    // No session per incoming request; unhandled rejections still exit.
    expect(sentry.httpIntegration).toHaveBeenCalledWith({ sessions: false })
    expect(sentry.onUnhandledRejectionIntegration).toHaveBeenCalledWith({ mode: 'strict' })
  })

  it('sends no span for an incoming request whose sentry-trace says sampled', async () => {
    vi.stubEnv('SENTRY_DSN', DSN)
    await loadInstrument()
    const actual = await vi.importActual<typeof import('@sentry/nestjs')>('@sentry/nestjs')
    const [options] = init.mock.calls[0] as [NonNullable<Parameters<typeof actual.init>[0]>]
    const sent: string[] = []
    // The real SDK with these options, sending envelopes to memory instead of Sentry.
    actual.init({
      ...options,
      transport: () => ({
        send: async (envelope) => {
          sent.push(...envelope[1].map(([header]) => header.type))
          return {}
        },
        flush: async () => true,
      }),
    })
    const server = createServer((_request, response) => response.end('ok'))
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    try {
      const { port } = server.address() as AddressInfo
      const trace = '0123456789abcdef0123456789abcdef-0123456789abcdef-1'
      await new Promise<void>((done, fail) =>
        get({ host: '127.0.0.1', port, path: '/projects', headers: { 'sentry-trace': trace } }, (response) => {
          response.resume().on('end', done)
        }).on('error', fail)
      )
      // Control: errors still reach the transport.
      actual.captureException(new Error('control'))
      await actual.flush(2000)
    } finally {
      server.close()
      await actual.close()
    }

    expect(sent).toEqual(['event'])
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
