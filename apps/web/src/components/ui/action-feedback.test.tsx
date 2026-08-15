import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { ActionFeedback } from './action-feedback'

describe('ActionFeedback', () => {
  it('announces a pending mutation as a status', () => {
    const markup = renderToStaticMarkup(
      <ActionFeedback id="save-status" pending pendingMessage="Saving draft…" />
    )

    expect(markup).toContain('id="save-status"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Saving draft…')
  })

  it('announces mutation failures as alerts', () => {
    const markup = renderToStaticMarkup(
      <ActionFeedback id="save-status" error="Could not save this record." />
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Could not save this record.')
  })

  it('announces successful saves as status updates', () => {
    const markup = renderToStaticMarkup(
      <ActionFeedback id="save-status" success="Draft saved." />
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Draft saved.')
  })
})
