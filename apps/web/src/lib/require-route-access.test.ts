import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { requireRouteAccess } from './require-route-access'

describe('page-level route access gate', () => {
  beforeEach(() => {
    mocks.redirect.mockClear()
  })

  it.each([
    ['sales', '/procurement/rfqs'],
    ['cx', '/procurement/deliveries'],
    ['sales', '/procurement/deliveries/11111111-1111-4111-8111-111111111111'],
    ['viewer', '/procurement/deliveries/new'],
    ['sales', '/permits'],
    ['finance', '/bom'],
  ] as const)('redirects %s away from %s', (role, pathname) => {
    expect(() => requireRouteAccess(role, pathname)).toThrow('redirect:/dashboard?error=forbidden')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard?error=forbidden')
  })

  it.each([
    ['procurement', '/procurement/rfqs'],
    ['viewer', '/procurement/deliveries'],
    ['pm', '/procurement/deliveries/new'],
    ['safety', '/permits'],
    ['estimator', '/bom'],
  ] as const)('lets %s open %s', (role, pathname) => {
    expect(() => requireRouteAccess(role, pathname)).not.toThrow()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
