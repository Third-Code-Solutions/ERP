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
