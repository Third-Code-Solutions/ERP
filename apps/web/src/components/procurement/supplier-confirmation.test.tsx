import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/purchase-orders/[id]/actions', () => ({
  recordSupplierConfirmation: vi.fn(),
}))

import { SupplierConfirmation } from './supplier-confirmation'

describe('SupplierConfirmation', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it('invites Procurement to record a confirmation that has not come in yet', () => {
    const html = renderToStaticMarkup(
      <SupplierConfirmation poId="po-1" recorded={null} canRecord today="2026-11-17" />
    )

    expect(html).toContain('has not confirmed this Purchase Order yet')
    expect(html).toContain('Record supplier confirmation')
  })

  it('shows who confirmed, when and how, and the note', () => {
    const html = renderToStaticMarkup(
      <SupplierConfirmation
        poId="po-1"
        recorded={{
          date: '2026-11-16',
          byName: 'Marlon Reyes',
          channel: 'phone',
          note: 'Delivery Friday',
        }}
        canRecord
        today="2026-11-17"
      />
    )

    expect(html).toContain('Confirmed by Marlon Reyes on 2026-11-16')
    expect(html).toContain('phone call')
    expect(html).toContain('Delivery Friday')
    expect(html).toContain('Change confirmation')
  })

  it('shows the record without any control to a user who cannot issue', () => {
    const html = renderToStaticMarkup(
      <SupplierConfirmation
        poId="po-1"
        recorded={{ date: '2026-11-16', byName: 'Marlon Reyes', channel: 'email', note: null }}
        canRecord={false}
        today="2026-11-17"
      />
    )

    expect(html).toContain('Confirmed by Marlon Reyes')
    expect(html).not.toContain('<button')
  })
})
