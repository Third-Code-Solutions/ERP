import { describe, expect, it } from 'vitest'
import { isProtectedRoute } from './protected-route'

describe('browser protected-route boundary', () => {
  it('requires a session for Cortex and every dashboard module', () => {
    expect(isProtectedRoute('/cortex')).toBe(true)
    expect(isProtectedRoute('/cortex/saved')).toBe(true)
    expect(isProtectedRoute('/projects/11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isProtectedRoute('/finance')).toBe(true)
    expect(isProtectedRoute('/inventory/receipts')).toBe(true)
  })

  it('does not overmatch similarly named public paths or APIs', () => {
    expect(isProtectedRoute('/cortexology')).toBe(false)
    expect(isProtectedRoute('/api/cortex/search')).toBe(false)
    expect(isProtectedRoute('/auth/login')).toBe(false)
    expect(isProtectedRoute('/')).toBe(false)
  })
})
