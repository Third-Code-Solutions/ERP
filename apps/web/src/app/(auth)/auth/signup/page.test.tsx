import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./signup-form', () => ({ SignupForm: () => <form data-testid="signup-form" /> }))

import SignupPage from './page'

function renderSignup(): string {
  vi.stubGlobal('React', React)
  return renderToStaticMarkup(SignupPage())
}

describe('SignupPage invitation-only switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shows the form when the flag is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED', '')

    expect(renderSignup()).toContain('data-testid="signup-form"')
  })

  it('shows the invitation notice and no form when the flag is false', () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED', 'false')

    const markup = renderSignup()

    expect(markup).not.toContain('data-testid="signup-form"')
    expect(markup).toContain('Ask your administrator to invite you.')
    expect(markup).toContain('href="/auth/login"')
  })
})
