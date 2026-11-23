import { describe, expect, it } from 'vitest'
import {
  isPublicSignupEnabled,
  SIGNUP_BY_INVITATION_MESSAGE,
  signupErrorMessage,
  validateSignupInput,
} from './signup-validation'

const validInput = {
  fullName: 'Investor Smoke',
  companyName: 'Northstar Demo',
  organizationType: 'construction',
  email: 'investor@example.com',
  password: 'StrongPassword12',
  confirm: 'StrongPassword12',
}

describe('signup validation', () => {
  it('returns the first actionable field error', () => {
    expect(
      validateSignupInput({ ...validInput, email: 'invalid-email' })
    ).toEqual({
      field: 'email',
      message: 'Enter a valid email address.',
    })
  })

  it('validates password length before confirmation matching', () => {
    expect(
      validateSignupInput({
        ...validInput,
        password: 'short',
        confirm: 'different',
      })
    ).toEqual({
      field: 'password',
      message: 'Password must be at least 12 characters.',
    })
  })

  it('accepts a complete signup payload', () => {
    expect(validateSignupInput(validInput)).toBeNull()
  })
})

describe('signup provider errors', () => {
  it.each([
    ['signup_disabled by code', { code: 'signup_disabled', message: 'anything' }],
    ['email_provider_disabled by code', { code: 'email_provider_disabled', message: 'anything' }],
    ['the legacy message without a code', { message: 'Signups not allowed for this instance' }],
    ['the email provider message', { message: 'Email signups are disabled' }],
  ])('maps %s to the invitation-only message', (_label, error) => {
    expect(signupErrorMessage(error)).toBe(SIGNUP_BY_INVITATION_MESSAGE)
  })

  it('keeps the provider text for every other failure', () => {
    expect(
      signupErrorMessage({ code: 'weak_password', message: 'Password is too weak.' })
    ).toBe('Password is too weak.')
  })
})

describe('public sign-up switch', () => {
  it('stays on unless the value is exactly false', () => {
    expect(isPublicSignupEnabled(undefined)).toBe(true)
    expect(isPublicSignupEnabled('')).toBe(true)
    expect(isPublicSignupEnabled('true')).toBe(true)
    expect(isPublicSignupEnabled('FALSE')).toBe(true)
    expect(isPublicSignupEnabled('false')).toBe(false)
  })
})
