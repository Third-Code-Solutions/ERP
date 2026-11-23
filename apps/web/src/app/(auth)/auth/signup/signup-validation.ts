import { isOrganizationType } from '@third-code-erp/shared-types'

export type SignupField =
  | 'fullName'
  | 'companyName'
  | 'organizationType'
  | 'email'
  | 'password'
  | 'confirm'

export type SignupInput = {
  fullName: string
  companyName: string
  organizationType: string
  email: string
  password: string
  confirm: string
}

export type SignupValidationError = {
  field: SignupField
  message: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSignupInput(
  input: SignupInput
): SignupValidationError | null {
  if (!input.fullName.trim()) {
    return { field: 'fullName', message: 'Enter your name.' }
  }
  if (!input.companyName.trim()) {
    return { field: 'companyName', message: 'Enter your company name.' }
  }
  if (!isOrganizationType(input.organizationType)) {
    return { field: 'organizationType', message: 'Choose a business type.' }
  }
  if (!EMAIL_PATTERN.test(input.email.trim())) {
    return { field: 'email', message: 'Enter a valid email address.' }
  }
  if (input.password.length < 12) {
    return {
      field: 'password',
      message: 'Password must be at least 12 characters.',
    }
  }
  if (input.password !== input.confirm) {
    return { field: 'confirm', message: 'Passwords do not match.' }
  }
  return null
}

// Self sign-up creates a brand-new workspace, so a deployment that only onboards
// by invitation turns it off. Anything but exactly 'false' keeps it on.
export function isPublicSignupEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED
): boolean {
  return value !== 'false'
}

export const SIGNUP_BY_INVITATION_MESSAGE =
  'Sign-up is by invitation. Ask your administrator to invite you.'

const SIGNUP_DISABLED_CODES: ReadonlySet<string> = new Set([
  'signup_disabled',
  'email_provider_disabled',
])
// Older Supabase releases return only the message text, with no error code.
const SIGNUP_DISABLED_MESSAGE = /sign-?ups?\b.*\b(not allowed|disabled)/i

/** Plain text for a failed sign-up; the provider's own wording is shown otherwise. */
export function signupErrorMessage(error: {
  code?: string | undefined
  message: string
}): string {
  const disabled =
    (error.code !== undefined && SIGNUP_DISABLED_CODES.has(error.code)) ||
    SIGNUP_DISABLED_MESSAGE.test(error.message)
  return disabled ? SIGNUP_BY_INVITATION_MESSAGE : error.message
}
