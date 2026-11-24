import { describe, expect, it } from 'vitest'
import {
  scrubSentryEvent,
  scrubSentryUrl,
  sentryErrorsOnlyOptions,
} from '../sentry-privacy'

const DSN = 'https://key@o1.ingest.us.sentry.io/2'

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
        httpHeaders: { request: true, response: false },
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
      },
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
  it('drops cookies, bodies, query strings and credential headers', () => {
    const event = {
      request: {
        url: 'https://abi.example/finance?invoice=42#access_token=abc',
        query_string: 'invoice=42',
        cookies: { 'sb-access-token': 'jwt' },
        data: { password: 'hunter2' },
        headers: {
          Authorization: 'Bearer jwt',
          cookie: 'sb-access-token=jwt',
          'x-erp-core-webhook-token': 'secret',
          'idempotency-key': 'k1',
          'x-forwarded-for': '203.0.113.9',
          'x-real-ip': '203.0.113.9',
          Referer: 'https://abi.example/portal/sign/tok123',
          'user-agent': 'Mozilla/5.0',
          'x-request-id': 'req-1',
        },
      },
    }

    const scrubbed = scrubSentryEvent(event)

    expect(scrubbed.request).toEqual({
      url: 'https://abi.example/finance',
      headers: { 'user-agent': 'Mozilla/5.0', 'x-request-id': 'req-1' },
    })
    // The SDK's event object is left untouched; a scrubbed copy is sent.
    expect(event.request.cookies).toEqual({ 'sb-access-token': 'jwt' })
  })

  it('redacts capability-link tokens in urls, breadcrumbs and transactions', () => {
    const scrubbed = scrubSentryEvent({
      request: { url: 'https://abi.example/portal/sign/tok123/review?x=1' },
      transaction: 'POST /v1/public/purchase-orders/tok456/confirmation',
      breadcrumbs: [
        { data: { from: '/portal/bom/tok789', to: '/auth/callback?code=c1' } },
        { data: { url: 'https://api.example/v1/public/signatures/tok000', status_code: 500 } },
        {},
      ],
    })

    expect(scrubbed.request?.url).toBe(
      'https://abi.example/portal/sign/[redacted]/review'
    )
    expect(scrubbed.transaction).toBe(
      'POST /v1/public/purchase-orders/[redacted]/confirmation'
    )
    expect(scrubbed.breadcrumbs).toEqual([
      { data: { from: '/portal/bom/[redacted]', to: '/auth/callback' } },
      {
        data: {
          url: 'https://api.example/v1/public/signatures/[redacted]',
          status_code: 500,
        },
      },
      {},
    ])
  })

  it('leaves events without request data unchanged', () => {
    const event = { message: 'boom', breadcrumbs: [] }
    expect(scrubSentryEvent(event)).toEqual({ message: 'boom', breadcrumbs: [] })
  })
})

describe('scrubSentryUrl', () => {
  it('keeps ordinary workspace paths', () => {
    expect(scrubSentryUrl('/projects/0f3c/billing')).toBe('/projects/0f3c/billing')
  })
})
