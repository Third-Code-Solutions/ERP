import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/punchlist/actions', () => ({
  updatePunchlistStatus: vi.fn(),
  signOffPunchlistItem: vi.fn(),
}))

import { PunchlistStatusActions } from './punchlist-status-actions'

describe('PunchlistStatusActions', () => {
  it('offers the transitions and PE sign-off to a role that may manage the item', () => {
    const html = renderToStaticMarkup(
      <PunchlistStatusActions
        itemId="item-1"
        currentStatus="for_inspection"
        isSignedOff={false}
        canManage
        canSignOff
      />
    )

    expect(html).toContain('Mark in progress')
    expect(html).toContain('PE sign-off &amp; close')
  })

  it('shows a view-only note instead of buttons that would fail for the role', () => {
    const html = renderToStaticMarkup(
      <PunchlistStatusActions
        itemId="item-1"
        currentStatus="for_inspection"
        isSignedOff={false}
        canManage={false}
        canSignOff={false}
      />
    )

    expect(html).toContain('View only.')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('This item is closed')
  })
})
