import { describe, expect, it } from 'vitest'
import { validateSignupInput } from './signup-validation'

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
