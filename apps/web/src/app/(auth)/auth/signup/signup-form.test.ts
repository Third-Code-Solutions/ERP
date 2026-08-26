import { describe, expect, it } from 'vitest'

import {
  buildSelfSignupMetadata,
  getSignupResponseOutcome,
} from './signup-form'

describe('SignupForm provisioning contract', () => {
  it('sends only the explicit self-signup discriminator and non-authoritative profile fields', () => {
    const metadata = buildSelfSignupMetadata({
      fullName: 'Juan dela Cruz',
      companyName: 'Actuate Builders Inc.',
      organizationType: 'general_contractor',
    })

    expect(metadata).toEqual({
      provisioning_mode: 'self_signup_v1',
      full_name: 'Juan dela Cruz',
      company_name: 'Actuate Builders Inc.',
      organization_type: 'general_contractor',
    })
    expect(metadata).not.toHaveProperty('tenant_id')
    expect(metadata).not.toHaveProperty('role')
    expect(metadata).not.toHaveProperty('invited_by')
    expect(metadata).not.toHaveProperty('tenant_invite_v1')
    expect(metadata).not.toHaveProperty('tenant_invitation_token_v1')
  })

  it('preserves the user-safe Supabase signup error', () => {
    expect(
      getSignupResponseOutcome({
        data: { session: null },
        error: { message: 'This email address is already registered.' },
      })
    ).toEqual({
      type: 'error',
      message: 'This email address is already registered.',
    })
  })

  it('keeps the existing session and confirmation success paths distinct', () => {
    expect(
      getSignupResponseOutcome({
        data: { session: { access_token: 'session-token' } },
        error: null,
      })
    ).toEqual({ type: 'session' })

    expect(
      getSignupResponseOutcome({
        data: { session: null },
        error: null,
      })
    ).toEqual({ type: 'confirmation' })
  })
})
