import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./login-form', () => ({ LoginForm: () => null }))

import LoginPage from './page'

async function renderLogin(): Promise<string> {
  vi.stubGlobal('React', React)
  return renderToStaticMarkup(
    await LoginPage({ searchParams: Promise.resolve({}) })
  )
}

describe('LoginPage sign-up link', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('keeps the link when the flag is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED', '')

    expect(await renderLogin()).toContain('href="/auth/signup"')
  })

  it('keeps the link when the flag is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED', 'true')

    expect(await renderLogin()).toContain('href="/auth/signup"')
  })

  it('hides the link and points to the administrator when the flag is false', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED', 'false')

    const markup = await renderLogin()

    expect(markup).not.toContain('/auth/signup')
    expect(markup).toContain('Ask your administrator to invite you.')
  })
})
