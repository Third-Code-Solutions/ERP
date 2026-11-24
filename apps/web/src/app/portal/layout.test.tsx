import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  resolvePortalCompanyName: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('./portal-tenant', () => ({
  resolvePortalCompanyName: mocks.resolvePortalCompanyName,
}))

import PortalLayout, { metadata } from './layout'

async function render(pathname: string | null) {
  mocks.headers.mockResolvedValue({
    get: (name: string) => (name === 'x-pathname' ? pathname : null),
  })
  return renderToStaticMarkup(await PortalLayout({ children: 'Project progress' }))
}

describe('shared client portal layout', () => {
  // Vitest uses classic JSX while Next compiles this layout with automatic JSX.
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not mislabel warranty or project links as a bill of materials', async () => {
    mocks.resolvePortalCompanyName.mockResolvedValue('Northwind Builders')
    const markup = await render('/portal/project/abc123')

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(markup).toContain('a secure link from Northwind Builders')
    expect(markup).not.toContain('Bill of Materials')
    expect(markup).toContain('Project progress')
  })

  it('names the tenant behind the link, not the product or another company', async () => {
    mocks.resolvePortalCompanyName.mockResolvedValue('Northwind Builders')
    const markup = await render('/portal/purchase-order/abc123/confirmation')

    expect(mocks.resolvePortalCompanyName).toHaveBeenCalledWith('/portal/purchase-order/abc123/confirmation')
    expect(markup).toContain('Northwind Builders')
    expect(markup).not.toContain('Actuate')
    expect(markup).not.toContain('ABI OPS ·')
  })

  it('falls back to a neutral name when the tenant cannot be resolved', async () => {
    mocks.resolvePortalCompanyName.mockResolvedValue(null)
    const markup = await render(null)

    expect(markup).toContain('Your contractor')
    expect(markup).not.toContain('Actuate')
  })

  it('keeps the product name to a small powered-by line', async () => {
    mocks.resolvePortalCompanyName.mockResolvedValue('Northwind Builders')
    const markup = await render('/portal/bom/abc123')

    expect(markup).toContain('Powered by ABI OPS')
    expect(markup.match(/ABI OPS/g)).toHaveLength(1)
  })

  it('keeps the product suffix out of portal page titles', () => {
    expect(metadata.title).toEqual({ default: 'Client Portal', template: '%s' })
  })
})
