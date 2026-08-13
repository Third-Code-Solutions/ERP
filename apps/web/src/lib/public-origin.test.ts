import { describe, expect, it } from 'vitest'

import { resolvePublicOrigin } from './public-origin'

describe('resolvePublicOrigin', () => {
  it('prefers the explicitly configured public site URL', () => {
    expect(
      resolvePublicOrigin({
        NEXT_PUBLIC_SITE_URL: 'https://ops.example.com/',
        SITE_URL: 'https://ignored.example',
        VERCEL_PROJECT_PRODUCTION_URL: 'ignored.vercel.app',
      }).toString()
    ).toBe('https://ops.example.com/')
  })

  it('uses the server-only site URL when the public value is absent', () => {
    expect(
      resolvePublicOrigin({
        SITE_URL: 'https://erp.example.com/',
      }).toString()
    ).toBe('https://erp.example.com/')
  })

  it('adds HTTPS to Vercel production hostnames', () => {
    expect(
      resolvePublicOrigin({
        VERCEL_PROJECT_PRODUCTION_URL: 'abi-ops.vercel.app',
      }).toString()
    ).toBe('https://abi-ops.vercel.app/')
  })

  it('keeps a local origin as the development fallback', () => {
    expect(resolvePublicOrigin({}).toString()).toBe(
      'http://localhost:3000/'
    )
  })

  it.each([
    'ftp://erp.example.com',
    'https://user:password@erp.example.com',
    'https://erp.example.com/public',
    'not a URL',
  ])('rejects an unsafe or ambiguous configured origin: %s', (value) => {
    expect(() =>
      resolvePublicOrigin({
        NEXT_PUBLIC_SITE_URL: value,
      })
    ).toThrow('Invalid NEXT_PUBLIC_SITE_URL')
  })
})
