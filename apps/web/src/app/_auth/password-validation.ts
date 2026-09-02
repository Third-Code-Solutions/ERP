import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

const resetEmailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')

const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `Password must be no more than ${PASSWORD_MAX_LENGTH} characters.`
      ),
    confirmation: z.string(),
  })
  .superRefine((input, context) => {
    if (input.password !== input.confirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: 'Passwords do not match.',
      })
    }
  })

const authenticatedPasswordChangeSchema = newPasswordSchema
  .and(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password.'),
    })
  )
  .superRefine((input, context) => {
    if (input.password === input.currentPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'New password must be different from your current password.',
      })
    }
  })

export type PasswordField =
  | 'currentPassword'
  | 'password'
  | 'confirmation'

export type PasswordValidationError = {
  field: PasswordField
  message: string
}

export function validatePasswordResetEmail(email: string): string | null {
  const result = resetEmailSchema.safeParse(email)
  return result.success ? null : result.error.issues[0]?.message ?? 'Enter a valid email address.'
}

export function validateNewPassword(input: {
  password: string
  confirmation: string
}): PasswordValidationError | null {
  const result = newPasswordSchema.safeParse(input)
  if (result.success) return null
  const issue = result.error.issues[0]
  return {
    field: issue?.path[0] === 'confirmation' ? 'confirmation' : 'password',
    message: issue?.message ?? 'Enter a valid password.',
  }
}

export function validateAuthenticatedPasswordChange(input: {
  currentPassword: string
  password: string
  confirmation: string
}): PasswordValidationError | null {
  const result = authenticatedPasswordChangeSchema.safeParse(input)
  if (result.success) return null
  const issue = result.error.issues[0]
  const field = issue?.path[0]
  return {
    field:
      field === 'currentPassword' || field === 'confirmation'
        ? field
        : 'password',
    message: issue?.message ?? 'Enter valid password details.',
  }
}
