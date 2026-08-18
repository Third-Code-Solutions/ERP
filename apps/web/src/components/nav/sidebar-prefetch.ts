/**
 * Warm a route only after an explicit pointer or keyboard intent. Keeping the
 * visited set in the Sidebar avoids repeatedly starting the same dynamic route
 * request while a user moves through the navigation.
 */
export const SIDEBAR_PREFETCH_DELAY_MS = 120

export function prefetchRouteOnIntent(
  prefetchedHrefs: Set<string>,
  href: string,
  prefetch: (href: string) => void
): boolean {
  if (prefetchedHrefs.has(href)) return false

  prefetchedHrefs.add(href)
  prefetch(href)
  return true
}

export function scheduleRoutePrefetchOnIntent(params: {
  prefetchedHrefs: Set<string>
  scheduledHrefs: Map<string, ReturnType<typeof setTimeout>>
  href: string
  prefetch: (href: string) => void
}): boolean {
  const { prefetchedHrefs, scheduledHrefs, href, prefetch } = params
  if (prefetchedHrefs.has(href) || scheduledHrefs.has(href)) return false

  const timeout = setTimeout(() => {
    scheduledHrefs.delete(href)
    prefetchRouteOnIntent(prefetchedHrefs, href, prefetch)
  }, SIDEBAR_PREFETCH_DELAY_MS)

  scheduledHrefs.set(href, timeout)
  return true
}

export function cancelScheduledRoutePrefetch(
  scheduledHrefs: Map<string, ReturnType<typeof setTimeout>>,
  href: string
): boolean {
  const timeout = scheduledHrefs.get(href)
  if (timeout === undefined) return false

  clearTimeout(timeout)
  scheduledHrefs.delete(href)
  return true
}
