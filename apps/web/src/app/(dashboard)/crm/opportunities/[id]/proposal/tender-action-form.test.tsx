import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TenderActionForm } from './tender-action-form'

describe('TenderActionForm', () => {
  it('wraps fields in a fieldset that can be disabled while saving, without an action= attribute', () => {
    const html = renderToStaticMarkup(
      <TenderActionForm action={vi.fn(async () => ({}))} className="tender-form">
        <input name="title" />
        <button type="submit">Save</button>
      </TenderActionForm>,
    )
    expect(html).toContain('<form class="tender-form" aria-busy="false">')
    expect(html).toContain('<fieldset style="display:contents"><input name="title"/><button type="submit">Save</button></fieldset>')
    expect(html).not.toContain('role="alert"')
  })
})
