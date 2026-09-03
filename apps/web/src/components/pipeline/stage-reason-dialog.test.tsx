import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { LostReasonDialog } from './lost-reason-dialog'
import { RegressionReasonDialog } from './regression-reason-dialog'

beforeAll(() => {
  vi.stubGlobal('React', React)
})

describe('LostReasonDialog', () => {
  it('renders required Lost-specific copy and blocks blank confirmation', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LostReasonDialog, {
        open: true,
        isSubmitting: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      })
    )

    expect(markup).toContain('Lost reason required')
    expect(markup).toContain('aria-label="Lost reason"')
    expect(markup).toContain('required=""')
    expect(markup).toContain('maxLength="1000"')
    expect(markup).toContain('Mark as Lost')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('Optional')
    expect(markup).not.toContain('is a regression')
  })
})

describe('RegressionReasonDialog', () => {
  it('renders a required, labelled reason capped at the Core boundary', () => {
    const markup = renderToStaticMarkup(
      React.createElement(RegressionReasonDialog, {
        open: true,
        fromLabel: 'BOM Submission',
        toLabel: 'Design',
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      })
    )

    expect(markup).toContain('aria-label="Regression reason"')
    expect(markup).toContain('required=""')
    expect(markup).toContain('maxLength="1000"')
    expect(markup).toContain('is a regression')
    expect(markup).not.toContain('deal was lost')
  })
})
