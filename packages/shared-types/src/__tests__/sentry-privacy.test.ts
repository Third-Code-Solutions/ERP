import { describe, expect, it } from 'vitest'
import {
  dropConsoleBreadcrumb,
  scrubSentryEvent,
  scrubSentryUrl,
  sentryErrorsOnlyOptions,
  withoutSessionTracking,
} from '../sentry-privacy'

const DSN = 'https://key@o1.ingest.us.sentry.io/2'
const TOKEN = 'CAPTOKEN123'

describe('sentryErrorsOnlyOptions', () => {
  it('returns null without a DSN so the SDK is never initialised', () => {
    expect(sentryErrorsOnlyOptions({})).toBeNull()
    expect(sentryErrorsOnlyOptions({ dsn: '  ', environment: 'production' })).toBeNull()
  })

  it('reports errors only, with every data category closed', () => {
    expect(
      sentryErrorsOnlyOptions({ dsn: DSN, environment: 'production', release: 'abc123' })
    ).toEqual({
      dsn: DSN,
      environment: 'production',
      release: 'abc123',
      tracesSampleRate: 0,
      integrations: withoutSessionTracking,
      sendClientReports: false,
      tracePropagationTargets: [],
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: {
          request: {
            allow: ['accept', 'accept-language', 'content-type', 'user-agent', 'x-request-id'],
          },
          response: false,
        },
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
      },
      beforeBreadcrumb: dropConsoleBreadcrumb,
      beforeSend: scrubSentryEvent,
    })
  })

  it('keeps every default integration except browser session tracking', () => {
    // @sentry/browser 11.12.0 getDefaultIntegrations, in order.
    const defaults = ['EventFilters', 'FunctionToString', 'ConversationId', 'BrowserApiErrors', 'Breadcrumbs', 'Console', 'GlobalHandlers', 'LinkedErrors', 'Dedupe', 'HttpContext', 'CultureContext', 'BrowserSession']
      .map((name) => ({ name }))
    const options = sentryErrorsOnlyOptions({ dsn: DSN })
    const integrations = options?.integrations(defaults).map(({ name }) => name)
    expect(integrations).not.toContain('BrowserSession')
    expect(integrations).toEqual(defaults.slice(0, -1).map(({ name }) => name))
    expect(options?.sendClientReports).toBe(false)
  })

  it('omits unset environment and release instead of overriding SDK values', () => {
    const options = sentryErrorsOnlyOptions({ dsn: DSN, environment: '', release: undefined })
    expect(options).not.toHaveProperty('environment')
    expect(options).not.toHaveProperty('release')
  })
})

describe('scrubSentryEvent', () => {
  // Shaped like @sentry/nextjs captureRequestError output for a failing
  // portal server action that hit a Drizzle query error.
  function portalServerActionEvent() {
    const routerStateTree = encodeURIComponent(
      JSON.stringify([
        '',
        { children: ['portal', { children: ['sign', { children: [['token', TOKEN, 'd'], { children: ['__PAGE__', {}] }] }] }] },
      ])
    )
    return {
      event_id: 'e1',
      transaction: 'POST /portal/sign/[token]',
      request: {
        method: 'POST',
        url: `https://abi.example/portal/sign/${TOKEN}?_rsc=1`,
        headers: {
          'next-router-state-tree': routerStateTree,
          'next-url': `/portal/sign/${TOKEN}`,
          'next-action': 'abc',
          'x-vercel-ip-city': 'Makati',
          'x-vercel-ip-latitude': '14.55',
          'x-vercel-ip-longitude': '121.02',
          'x-vercel-ip-postal-code': '1226',
          'x-vercel-ip-country-region': '00',
          'x-forwarded-for': '203.0.113.9',
          authorization: '[Filtered]',
          'user-agent': 'UA',
        },
      },
      contexts: {
        nextjs: {
          request_path: `/portal/sign/${TOKEN}`,
          router_kind: 'App Router',
          router_path: '/portal/sign/[token]',
          route_type: 'action',
        },
      },
      exception: {
        values: [
          {
            type: 'DrizzleQueryError',
            value:
              'Failed query: insert into "accounts" ("tenant_id","name","tin","email") values ($1,$2,$3,$4)\nparams: 7f0c,Juan Dela Cruz,123-456-789-000,juan@example.ph',
            stacktrace: {
              frames: [{ filename: 'app:///portal/sign/[token]/actions.js', function: 'sign' }],
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: 'console',
          level: 'error',
          message: `[portal:sign] failed: Error: Failed query ... params: ana@client.ph,Ana Reyes`,
          data: { arguments: ['failed', 'ana@client.ph'], logger: 'console' },
        },
        {
          category: 'http',
          data: { url: `https://abi.example/api/v1/public/signatures/${TOKEN}`, method: 'GET', status_code: 500 },
        },
      ],
      tags: { link: `/portal/sign/${TOKEN}` },
      extra: { note: `retry /portal/sign/${TOKEN} later` },
    }
  }

  it('sends no capability token, geolocation, IP or query parameter from a portal error', () => {
    const scrubbed = scrubSentryEvent(portalServerActionEvent())
    const sent = JSON.stringify(scrubbed)

    for (const leaked of [
      TOKEN,
      'Makati',
      '14.55',
      '121.02',
      '1226',
      '203.0.113.9',
      '@',
      'Juan Dela Cruz',
      'Ana Reyes',
      '123-456-789-000',
      '_rsc',
    ]) {
      expect(sent).not.toContain(leaked)
    }
    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://abi.example/portal/sign/[redacted]',
      headers: { 'user-agent': 'UA' },
    })
    expect(scrubbed.contexts.nextjs.request_path).toBe('/portal/sign/[redacted]')
    expect(scrubbed.exception.values[0]?.value).toBe(
      'Failed query: insert into "accounts" ("tenant_id","name","tin","email") values ($1,$2,$3,$4)\nparams: [redacted]'
    )
    expect(scrubbed.tags.link).toBe('/portal/sign/[redacted]')
    expect(scrubbed.extra.note).toBe('retry /portal/sign/[redacted] later')
  })

  it('keeps route patterns, stack frames and non-console breadcrumbs', () => {
    const event = portalServerActionEvent()
    const scrubbed = scrubSentryEvent(event)

    expect(scrubbed.transaction).toBe('POST /portal/sign/[token]')
    expect(scrubbed.contexts.nextjs.router_path).toBe('/portal/sign/[token]')
    expect(scrubbed.exception.values[0]?.stacktrace).toEqual(event.exception.values[0]?.stacktrace)
    expect(scrubbed.breadcrumbs).toEqual([
      {
        category: 'http',
        data: { url: 'https://abi.example/api/v1/public/signatures/[redacted]', method: 'GET', status_code: 500 },
      },
    ])
  })

  // Second review repro: a server event and a browser event whose frames
  // carry the page URL (window.onerror on an inline script or a throw
  // without a stack), including the invite page's auth fragment.
  it('sends nothing sensitive from the review repro events', () => {
    const server = {
      request: {
        method: 'POST',
        url: `https://abi.example/portal/sign/${TOKEN}?_rsc=1`,
        query_string: 'x=1',
        env: { REMOTE_ADDR: '1.2.3.4' },
        headers: {
          'next-url': `/portal/sign/${TOKEN}`,
          'x-vercel-ip-city': 'Makati',
          'x-vercel-ip-latitude': '14.55',
          'x-vercel-ip-postal-code': '1226',
          'x-forwarded-for': '203.0.113.9',
          'accept-encoding': '[Filtered]',
          'user-agent': 'UA',
        },
      },
      contexts: { nextjs: { request_path: `/portal/sign/${TOKEN}`, router_path: '/portal/sign/[token]' } },
      exception: {
        values: [
          {
            type: 'DrizzleQueryError',
            value: 'Failed query: insert into "accounts" values ($1,$2)\nparams: Juan Dela Cruz,juan@example.ph',
          },
          { type: 'Error', value: `fetch failed for /v1/public/signatures/${TOKEN}` },
        ],
      },
      breadcrumbs: [
        { category: 'console', message: 'x params: ana@client.ph' },
        {
          category: 'http',
          data: { url: `https://api.example/v1/public/signatures/${TOKEN}` },
          message: `GET /portal/bom/${TOKEN}`,
        },
      ],
      tags: { t: `/portal/cnps/${TOKEN}` },
      extra: { e: `see /portal/warranty/${TOKEN}` },
    }
    const browser = {
      request: {
        url: 'https://abi.example/auth/accept-invite#access_token=AT_SECRET&refresh_token=RT_SECRET',
        headers: { 'User-Agent': 'UA', Referer: 'r' },
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Navigation to https://abi.example/auth/callback?code=CODE_SECRET failed for /auth/accept-invite#access_token=AT_SECRET',
            stacktrace: {
              frames: [
                {
                  filename: 'app:///auth/accept-invite#access_token=AT_SECRET&refresh_token=RT_SECRET',
                  function: '?',
                  in_app: true,
                },
                {
                  filename: `app:///portal/sign/${TOKEN}`,
                  abs_path: `https://abi.example/portal/sign/${TOKEN}?x=1`,
                  function: '?',
                },
              ],
            },
          },
        ],
      },
    }
    const leaks = [TOKEN, 'Makati', '14.55', '1226', '203.0.113.9', '1.2.3.4', '@', 'Juan', 'AT_SECRET', 'RT_SECRET', 'CODE_SECRET', '_rsc', 'next-url', 'accept-encoding']

    for (const event of [server, browser]) {
      const sent = JSON.stringify(scrubSentryEvent(event))
      expect(leaks.filter((leak) => sent.includes(leak))).toEqual([])
    }
    expect(scrubSentryEvent(browser).exception.values[0]?.stacktrace.frames).toEqual([
      { filename: 'app:///auth/accept-invite', function: '?', in_app: true },
      { filename: 'app:///portal/sign/[redacted]', abs_path: 'https://abi.example/portal/sign/[redacted]', function: '?' },
    ])
  })

  it('redacts percent-encoded capability links and keeps encoded route patterns', () => {
    expect(scrubSentryEvent({ transaction: `next=%2Fportal%2Fsign%2F${TOKEN}%3Fx%3D1 done` }).transaction).toBe(
      'next=%2Fportal%2Fsign%2F[redacted]%3Fx%3D1 done'
    )
    expect(scrubSentryEvent({ transaction: 'route %2Fportal%2Fsign%2F%5Btoken%5D' }).transaction).toBe(
      'route %2Fportal%2Fsign%2F%5Btoken%5D'
    )
  })

  // Third review repro: each string goes through the scrubber as free text.
  it.each([
    ['absolute URL fragment', 'redirect failed https://abi.example/auth/accept-invite#access_token=AT2&refresh_token=RT2 now', 'redirect failed https://abi.example/auth/accept-invite now'],
    ['relative auth fragment', 'bad link /auth/accept-invite#access_token=AT3&refresh_token=RT3&provider_token=PT3 x', 'bad link /auth/accept-invite#access_token=[redacted]&refresh_token=[redacted]&provider_token=[redacted] x'],
    ['auth code', 'callback /auth/callback?code=CODE4&next=/x', 'callback /auth/callback?code=[redacted]&next=/x'],
    ['token hash', '/auth/confirm?token_hash=TH5&type=recovery', '/auth/confirm?token_hash=[redacted]&type=recovery'],
    ['verify token', '/auth/v1/verify?token=VTOKEN&type=invite', '/auth/v1/verify?token=[redacted]&type=invite'],
    ['encoded link', `redirect_to=https%3A%2F%2Fabi.example%2Fportal%2Fsign%2F${TOKEN}&type=x`, 'redirect_to=https%3A%2F%2Fabi.example%2Fportal%2Fsign%2F[redacted]&type=x'],
    ['lower-case encoding', `u=%2fportal%2fcnps%2f${TOKEN}`, 'u=%2fportal%2fcnps%2f[redacted]'],
    ['mixed encoding', `u=/portal%2Fbom%2F${TOKEN}`, 'u=/portal%2Fbom%2F[redacted]'],
    ['encoded Core API link', `%2Fv1%2Fpublic%2Fsignatures%2F${TOKEN}`, '%2Fv1%2Fpublic%2Fsignatures%2F[redacted]'],
    ['escape inside the token', `/portal/sign/AB%2BCD${TOKEN}`, '/portal/sign/[redacted]'],
    ['double encoding', `u=%252Fportal%252Fsign%252F${TOKEN}`, 'u=%252Fportal%252Fsign%252F[redacted]'],
    ['JSON session', '{"access_token":"eyJaaa.bbb.ccc","refresh_token":"RTJSON"}', '{"access_token":"[redacted]","refresh_token":"[redacted]"}'],
    ['bare JWT', 'Bearer eyJhbGciOi.eyJzdWIi.SIGNATURE', 'Bearer [redacted-jwt]'],
  ])('redacts %s in free text', (_case, text, expected) => {
    expect(scrubSentryEvent({ transaction: text }).transaction).toBe(expected)
  })

  it('scrubs page URLs in frames and keeps encoded route patterns in chunk paths', () => {
    const frames = [
      { filename: 'app:///auth/accept-invite#access_token=AT1&refresh_token=RT1&type=invite' },
      { filename: `https://abi.example/portal/sign/${TOKEN}?x=QSECRET` },
      { filename: 'app:///_next/static/chunks/app/portal/sign/[token]/page-abc.js' },
      { filename: 'app:///_next/static/chunks/app/portal/sign/%5Btoken%5D/page-abc.js' },
      { filename: 'app:///_next/static/chunks/app/portal/sign/%255Btoken%255D/page-abc.js' },
    ]
    const scrubbed = scrubSentryEvent({
      transaction: 'GET /portal/sign/[token]',
      exception: { values: [{ stacktrace: { frames } }] },
    })
    expect(scrubbed.exception.values[0]?.stacktrace.frames.map((frame) => frame.filename)).toEqual([
      'app:///auth/accept-invite',
      'https://abi.example/portal/sign/[redacted]',
      'app:///_next/static/chunks/app/portal/sign/[token]/page-abc.js',
      'app:///_next/static/chunks/app/portal/sign/%5Btoken%5D/page-abc.js',
      'app:///_next/static/chunks/app/portal/sign/%255Btoken%255D/page-abc.js',
    ])
  })

  it('drops cookies, bodies, server env and query strings; headers by allowlist', () => {
    const event = {
      request: {
        url: 'https://abi.example/finance?invoice=42#access_token=abc',
        query_string: 'invoice=42',
        cookies: { 'sb-access-token': 'jwt' },
        data: { password: 'hunter2' },
        env: { REMOTE_ADDR: '203.0.113.9' },
        headers: {
          Authorization: 'Bearer jwt',
          cookie: 'sb-access-token=jwt',
          'x-erp-core-webhook-token': 'secret',
          'idempotency-key': 'k1',
          Referer: 'https://abi.example/portal/sign/tok123',
          'User-Agent': 'Mozilla/5.0',
          'x-request-id': 'req-1',
        },
      },
    }

    const scrubbed = scrubSentryEvent(event)

    expect(scrubbed.request).toEqual({
      url: 'https://abi.example/finance',
      headers: { 'User-Agent': 'Mozilla/5.0', 'x-request-id': 'req-1' },
    })
    // The SDK's event object is left untouched; a scrubbed copy is sent.
    expect(event.request.cookies).toEqual({ 'sb-access-token': 'jwt' })
  })

  it('strips queries from navigation breadcrumbs', () => {
    const scrubbed = scrubSentryEvent({
      breadcrumbs: [{ category: 'navigation', data: { from: '/portal/bom/tok789', to: '/auth/callback?code=c1' } }],
    })
    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/portal/bom/[redacted]', to: '/auth/callback' } },
    ])
  })

  it('passes SDK processing metadata through without walking it', () => {
    const metadata: Record<string, unknown> = { normalizedRequest: { url: `/portal/sign/${TOKEN}` } }
    metadata.self = metadata
    const scrubbed = scrubSentryEvent({ message: 'boom', sdkProcessingMetadata: metadata })
    expect(scrubbed.sdkProcessingMetadata).toBe(metadata)
    expect(scrubbed).toMatchObject({ message: 'boom' })
  })

  it('leaves events without sensitive data unchanged', () => {
    const event = { message: 'boom', breadcrumbs: [] }
    expect(scrubSentryEvent(event)).toEqual({ message: 'boom', breadcrumbs: [] })
  })
})

describe('dropConsoleBreadcrumb', () => {
  it('never records console breadcrumbs', () => {
    expect(dropConsoleBreadcrumb({ category: 'console', message: 'params: a@b.ph' })).toBeNull()
    const fetch = { category: 'fetch', data: { url: '/api/x' } }
    expect(dropConsoleBreadcrumb(fetch)).toBe(fetch)
  })
})

describe('scrubSentryUrl', () => {
  it('keeps ordinary workspace paths', () => {
    expect(scrubSentryUrl('/projects/0f3c/billing')).toBe('/projects/0f3c/billing')
  })
})
