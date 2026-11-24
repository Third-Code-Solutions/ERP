import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/purchase-orders/[id]/actions', () => ({
  linkPoLineToItem: vi.fn(),
}))

import { PoLineStockLink } from './po-line-stock-link'

function render(patch: Partial<Parameters<typeof PoLineStockLink>[0]> = {}): string {
  return renderToStaticMarkup(
    <PoLineStockLink
      lineId="line-1"
      itemCode={null}
      unitCode={null}
      reason="Not linked to a stock item. Open the Purchase Order and link it."
      editable
      canCreateFromLine
      items={[]}
      {...patch}
    />
  )
}

describe('PoLineStockLink', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it('shows the linked item and unit when the line can be received', () => {
    const html = render({ itemCode: 'MAT-1', unitCode: 'PC', reason: null })

    expect(html).toContain('Stock item MAT-1')
    expect(html).not.toContain('Link')
  })

  it('says why a line is not ready and offers the link to a user who can fix it', () => {
    const html = render()

    expect(html).toContain('Not linked to a stock item')
    expect(html).toContain('>Link</button>')
  })

  it('shows the reason but no control to a user who cannot change the link', () => {
    const html = render({ editable: false })

    expect(html).toContain('Not linked to a stock item')
    expect(html).not.toContain('<button')
  })
})
