import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const search = { value: '' }
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn() }),
}))

import { ForbiddenNotice } from './forbidden-notice'

describe('ForbiddenNotice', () => {
  it('explains a forbidden redirect', () => {
    search.value = 'error=forbidden'
    const markup = renderToStaticMarkup(<ForbiddenNotice />)
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('access to that page')
  })

  it('renders nothing without the forbidden flag', () => {
    search.value = 'error=other'
    expect(renderToStaticMarkup(<ForbiddenNotice />)).toBe('')
  })
})
