import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FinanceLayout from './layout'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-pathname': '/finance' }),
}))

describe('Finance layout', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders page content without the removed tab bar or an empty wrapper', async () => {
    vi.stubGlobal('React', React)
    const children = createElement('main', null, 'Finance page content')
    const markup = renderToStaticMarkup(await FinanceLayout({ children }))

    expect(markup).toBe('<main>Finance page content</main>')
    expect(markup).not.toContain('aria-label="Finance navigation"')
    expect(markup).not.toContain('finance-route-nav')
  })
})
