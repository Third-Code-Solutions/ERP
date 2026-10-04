import { describe, expect, it } from 'vitest'

import robots from './robots'

describe('robots.txt', () => {
  const rule = robots().rules as {
    disallow: string[]
    allow: string
  }

  it('excludes the platform console', () => {
    expect(rule.disallow).toContain('/platform-admin')
  })

  it('does not advertise paths that no longer resolve', () => {
    // /client 404s in production; a stale entry tells crawlers the route exists.
    expect(rule.disallow).not.toContain('/client')
  })

  it('keeps token-addressed client pages out of every index', () => {
    expect(rule.disallow).toContain('/portal')
  })
})
