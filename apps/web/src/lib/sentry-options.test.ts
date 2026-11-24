import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ErrorEvent } from '@sentry/nextjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryOptions } from './sentry-options'

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

// Vitest resolves @sentry/nextjs to its server build; load the browser build
// instrumentation-client.ts gets, by file, past the exports map. CJS, because
// the ESM build imports `next/router`, which Node ESM cannot resolve.
function loadBrowserSdk(): typeof import('@sentry/nextjs') {
  const load = createRequire(import.meta.url)
  const nextjs = dirname(load.resolve('@sentry/nextjs/package.json'))
  return load(join(nextjs, 'build/cjs/index.client.js')) as typeof import('@sentry/nextjs')
}

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
    // The release is injected at build time by withSentryConfig.
    expect(sentryOptions()).not.toHaveProperty('release')
  })

  it('drops every session integration from the Next.js browser SDK defaults', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const browserSdk = loadBrowserSdk()
    const defaults = browserSdk.getDefaultIntegrations({}).map(({ name }) => name)
    const kept = sentryOptions()?.integrations(browserSdk.getDefaultIntegrations({})).map(({ name }) => name)

    expect(defaults).toContain('BrowserSession')
    expect(kept).toEqual(defaults.filter((name) => !/session/i.test(name)))
  })

  it('sends no span when a page continues a trace that says sampled', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const browserSdk = loadBrowserSdk()
    const options = sentryOptions()
    if (!options) throw new Error('expected options')
    const sent: string[] = []
    // The real browser SDK with these options, sending envelopes to memory.
    // Its default integrations need a DOM; sampling does not.
    browserSdk.init({
      ...options,
      defaultIntegrations: false,
      transport: () => ({
        send: async (envelope: [unknown, [{ type: string }, unknown][]]) => {
          sent.push(...envelope[1].map(([header]) => header.type))
          return {}
        },
        flush: async () => true,
      }),
    })
    try {
      // A pageload or navigation continues the sentry-trace and baggage
      // meta tags of the page it lands on.
      browserSdk.continueTrace(
        {
          sentryTrace: '0123456789abcdef0123456789abcdef-0123456789abcdef-1',
          baggage: 'sentry-trace_id=0123456789abcdef0123456789abcdef,sentry-sampled=true',
        },
        () => browserSdk.startSpan({ name: '/projects', op: 'navigation', forceTransaction: true }, () => {})
      )
      // Control: errors still reach the transport.
      browserSdk.captureException(new Error('control'))
      await browserSdk.flush(2000)
    } finally {
      await browserSdk.close()
    }

    expect(sent).toEqual(['event'])
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
