import { afterEach, describe, expect, it, vi } from 'vitest'

// The real server SDK, with init captured and httpIntegration spied on.
const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn(), httpIntegration: vi.fn() }))
vi.mock('@sentry/nextjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>()
  sentry.httpIntegration.mockImplementation(actual.httpIntegration)
  return { ...actual, ...sentry }
})

import { register } from './instrumentation'

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

describe('web Sentry registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    sentry.init.mockReset()
  })

  it('initialises the SDK in the Node.js runtime when a DSN is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    register()
    expect(sentry.init).toHaveBeenCalledTimes(1)
  })

  it('never initialises the SDK in the Edge runtime', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    register()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('keeps the server SDK defaults minus every session', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    register()
    const actual = await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs')
    const defaults = actual.getDefaultIntegrations({})
    const [{ integrations }] = sentry.init.mock.calls[0] as [
      { integrations: (defaults: { name: string }[]) => { name: string }[] },
    ]
    const names = integrations(defaults).map(({ name }) => name)

    expect(defaults.map(({ name }) => name)).toEqual(expect.arrayContaining(['Http', 'ProcessSession']))
    expect(names.filter((name) => /session/i.test(name))).toEqual([])
    expect(names.filter((name) => name === 'Http')).toHaveLength(1)
    // Next.js traces incoming requests itself; no session per request.
    expect(sentry.httpIntegration).toHaveBeenCalledWith({ disableIncomingRequestSpans: true, sessions: false })
  })
})
