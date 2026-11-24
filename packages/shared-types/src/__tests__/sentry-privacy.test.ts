import { describe, expect, it } from 'vitest'
import {
  dropConsoleBreadcrumb,
  scrubSentryEvent,
  scrubSentryUrl,
  sentryErrorsOnlyOptions,
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
    expect(scrubbed.exception.values[0]?.stacktrace).toBe(event.exception.values[0]?.stacktrace)
    expect(scrubbed.breadcrumbs).toEqual([
      {
        category: 'http',
        data: { url: 'https://abi.example/api/v1/public/signatures/[redacted]', method: 'GET', status_code: 500 },
      },
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
