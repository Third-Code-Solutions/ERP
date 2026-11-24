import { afterEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

import { register } from './instrumentation'

describe('web Sentry registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    sentry.init.mockReset()
  })

  it('initialises the SDK in the Node.js runtime when a DSN is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.us.sentry.io/2')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    register()
    expect(sentry.init).toHaveBeenCalledTimes(1)
  })

  it('never initialises the SDK in the Edge runtime', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.us.sentry.io/2')
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    register()
    expect(sentry.init).not.toHaveBeenCalled()
  })
})
