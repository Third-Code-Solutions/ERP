import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cancelScheduledRoutePrefetch,
  prefetchRouteOnIntent,
  scheduleRoutePrefetchOnIntent,
  SIDEBAR_PREFETCH_DELAY_MS,
} from './sidebar-prefetch'

afterEach(() => {
  vi.useRealTimers()
})

describe('prefetchRouteOnIntent', () => {
  it('warms each requested route once', () => {
    const prefetchedHrefs = new Set<string>()
    const prefetch = vi.fn()

    expect(prefetchRouteOnIntent(prefetchedHrefs, '/dashboard', prefetch)).toBe(true)
    expect(prefetchRouteOnIntent(prefetchedHrefs, '/dashboard', prefetch)).toBe(false)
    expect(prefetchRouteOnIntent(prefetchedHrefs, '/crm/accounts', prefetch)).toBe(true)

    expect(prefetch).toHaveBeenCalledTimes(2)
    expect(prefetch).toHaveBeenNthCalledWith(1, '/dashboard')
    expect(prefetch).toHaveBeenNthCalledWith(2, '/crm/accounts')
  })

  it('only prefetches after a sustained hover or focus intent', () => {
    vi.useFakeTimers()
    const prefetchedHrefs = new Set<string>()
    const scheduledHrefs = new Map<string, ReturnType<typeof setTimeout>>()
    const prefetch = vi.fn()

    expect(
      scheduleRoutePrefetchOnIntent({
        prefetchedHrefs,
        scheduledHrefs,
        href: '/crm/accounts',
        prefetch,
      })
    ).toBe(true)
    expect(cancelScheduledRoutePrefetch(scheduledHrefs, '/crm/accounts')).toBe(true)
    vi.advanceTimersByTime(SIDEBAR_PREFETCH_DELAY_MS)
    expect(prefetch).not.toHaveBeenCalled()

    expect(
      scheduleRoutePrefetchOnIntent({
        prefetchedHrefs,
        scheduledHrefs,
        href: '/crm/accounts',
        prefetch,
      })
    ).toBe(true)
    vi.advanceTimersByTime(SIDEBAR_PREFETCH_DELAY_MS)

    expect(prefetch).toHaveBeenCalledOnce()
    expect(prefetch).toHaveBeenCalledWith('/crm/accounts')
    expect(
      scheduleRoutePrefetchOnIntent({
        prefetchedHrefs,
        scheduledHrefs,
        href: '/crm/accounts',
        prefetch,
      })
    ).toBe(false)
  })
})
