import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/(dashboard)/projects/[id]/coc/actions', () => ({
  cancelCocSigningRequest: vi.fn(),
  draftCoc: vi.fn(),
  resendCocSigningLink: vi.fn(),
  sendCocForSignature: vi.fn(),
}))

import { CocActions } from './coc-actions'

const SIGNER = { name: 'Ana Client', email: 'ana@client.test' }

function render(props: Partial<React.ComponentProps<typeof CocActions>>): string {
  return renderToStaticMarkup(
    <CocActions
      projectId="p-1"
      status="draft"
      canManage
      signerDefaults={SIGNER}
      {...props}
    />
  )
}

describe('CocActions', () => {
  it('offers drafting when no certificate exists', () => {
    const html = render({ status: 'none', signerDefaults: null })

    expect(html).toContain('Draft COC')
    expect(html).not.toContain('Client signer')
  })

  it('lets the sender confirm or type the signer before sending a draft', () => {
    const html = render({ status: 'draft' })

    expect(html).toContain('Send for client signature')
    expect(html).toContain('Client signer')
    expect(html).toContain('value="Ana Client"')
    expect(html).toContain('value="ana@client.test"')
    expect(html).not.toContain('Resend signing link')
  })

  it('starts with empty signer fields when the project has no client contact', () => {
    const html = render({ status: 'draft', signerDefaults: null })

    expect(html).toContain('Send for client signature')
    expect(html).not.toContain('value="Ana Client"')
  })

  it('lets a pending certificate be resent or cancelled, because links expire', () => {
    const html = render({ status: 'pending_signature' })

    expect(html).toContain('Resend signing link')
    expect(html).toContain('Cancel request')
    expect(html).toContain('48 hours')
    expect(html).not.toContain('Send for client signature')
  })

  it('shows read-only roles who can act instead of dead buttons', () => {
    const html = render({ status: 'pending_signature', canManage: false })

    expect(html).toContain('Awaiting the client')
    expect(html).toContain('Only Admin, SD / PM / PE, PM and CX can draft or send it.')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Resend signing link')
  })
})
