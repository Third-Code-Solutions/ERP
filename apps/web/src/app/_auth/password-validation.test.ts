import { describe, expect, it } from 'vitest'

import {
  PASSWORD_MAX_LENGTH,
  validateAuthenticatedPasswordChange,
  validateNewPassword,
  validatePasswordResetEmail,
} from './password-validation'

describe('password workflow validation', () => {
  it('accepts a well-formed reset email and rejects malformed input', () => {
    expect(validatePasswordResetEmail(' user@abi.demo.ph ')).toBeNull()
    expect(validatePasswordResetEmail('not-an-email')).toBe(
      'Enter a valid email address.'
    )
  })

  it('enforces the 12 to 128 character password policy', () => {
    expect(
      validateNewPassword({ password: 'eleven-chrs', confirmation: 'eleven-chrs' })
    ).toEqual({
      field: 'password',
      message: 'Password must be at least 12 characters.',
    })

    const tooLong = 'a'.repeat(PASSWORD_MAX_LENGTH + 1)
    expect(
      validateNewPassword({ password: tooLong, confirmation: tooLong })
    ).toEqual({
      field: 'password',
      message: 'Password must be no more than 128 characters.',
    })
  })

  it('requires matching confirmation and the current password for settings changes', () => {
    expect(
      validateNewPassword({
        password: 'StrongPassword12',
        confirmation: 'DifferentPassword12',
      })
    ).toEqual({ field: 'confirmation', message: 'Passwords do not match.' })

    expect(
      validateAuthenticatedPasswordChange({
        currentPassword: '',
        password: 'StrongPassword12',
        confirmation: 'StrongPassword12',
      })
    ).toEqual({
      field: 'currentPassword',
      message: 'Enter your current password.',
    })

    expect(
      validateAuthenticatedPasswordChange({
        currentPassword: 'UnchangedPassword12',
        password: 'UnchangedPassword12',
        confirmation: 'UnchangedPassword12',
      })
    ).toEqual({
      field: 'password',
      message: 'New password must be different from your current password.',
    })
  })

  it('accepts a complete authenticated password change', () => {
    expect(
      validateAuthenticatedPasswordChange({
        currentPassword: 'CurrentPassword12',
        password: 'ReplacementPassword12',
        confirmation: 'ReplacementPassword12',
      })
    ).toBeNull()
  })
})
