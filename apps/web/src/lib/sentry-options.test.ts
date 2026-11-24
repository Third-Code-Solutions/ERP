import type { ErrorEvent } from '@sentry/nextjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryOptions } from './sentry-options'

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

describe('web sentryOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('disables the SDK when NEXT_PUBLIC_SENTRY_DSN is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    expect(sentryOptions()).toBeNull()
  })

  it('tags the Vercel environment and reports errors only', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'production')

    expect(sentryOptions()).toMatchObject({
      dsn: DSN,
      environment: 'production',
      tracesSampleRate: 0,
      sendClientReports: false,
    })
    expect(sentryOptions()?.integrations([{ name: 'Dedupe' }, { name: 'BrowserSession' }]))
      .toEqual([{ name: 'Dedupe' }])
    // The release is injected at build time by withSentryConfig.
    expect(sentryOptions()).not.toHaveProperty('release')
  })

  it('drops cookies, auth headers and query strings in beforeSend', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const event = {
      type: undefined,
      request: {
        url: 'https://abi.example/auth/callback?code=secret',
        query_string: 'code=secret',
        cookies: { 'sb-access-token': 'jwt' },
        headers: { authorization: 'Bearer jwt', 'user-agent': 'Mozilla/5.0' },
      },
    } satisfies ErrorEvent

    expect(sentryOptions()?.beforeSend(event).request).toEqual({
      url: 'https://abi.example/auth/callback',
      headers: { 'user-agent': 'Mozilla/5.0' },
    })
  })
})
