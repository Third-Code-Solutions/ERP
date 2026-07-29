import { describe, expect, it } from 'vitest'

import { resolvePublicOrigin } from './public-origin'

describe('resolvePublicOrigin', () => {
  it('prefers the explicitly configured public site URL', () => {
    expect(
      resolvePublicOrigin({
        NEXT_PUBLIC_SITE_URL: 'https://erp.thirdcode.solutions/',
        SITE_URL: 'https://ignored.example',
        VERCEL_PROJECT_PRODUCTION_URL: 'ignored.vercel.app',
      }).toString()
    ).toBe('https://erp.thirdcode.solutions/')
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
        VERCEL_PROJECT_PRODUCTION_URL: 'thirdcode-erp.vercel.app',
      }).toString()
    ).toBe('https://thirdcode-erp.vercel.app/')
  })

  it('keeps the current production origin as the compatibility fallback', () => {
    expect(resolvePublicOrigin({}).toString()).toBe(
      'https://thirdcode-erp.vercel.app/'
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
