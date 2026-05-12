import { z } from 'zod'

export const kycStatusValues = [
  'pending',
  'approved',
  'flagged',
  'rejected',
  'not_required',
] as const

export type KycStatus = (typeof kycStatusValues)[number]

export const accountIndustryValues = [
  'retail',
  'office',
  'food_and_beverage',
  'healthcare',
  'hospitality',
  'industrial',
  'residential',
  'mixed_use',
  'other',
] as const

export type AccountIndustry = (typeof accountIndustryValues)[number]

export const kycArtifactTypeValues = [
  'afs_year_1',
  'afs_year_2',
  'afs_year_3',
  'bir_2303',
  'vat_certificate',
  'top_suppliers',
  'top_clients',
  'other',
] as const

export type KycArtifactType = (typeof kycArtifactTypeValues)[number]

// REFACTOR.md M1 US-001 — account creation form. KYC artifacts upload via
// the file upload pipeline, so the create endpoint only takes core fields;
// artifacts are attached after creation via a separate `addKycArtifact` action.
export const createAccountSchema = z.object({
  name: z.string().min(2).max(255),
  industry: z.enum(accountIndustryValues).default('other'),
  billing_address: z.string().max(1000).optional(),
  primary_email: z.string().email().optional(),
  primary_phone: z.string().max(64).optional(),
})

export const updateAccountSchema = createAccountSchema.partial()

export const createContactSchema = z.object({
  account_id: z.string().uuid(),
  full_name: z.string().min(2).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  role_title: z.string().max(120).optional(),
  is_primary: z.boolean().default(false),
})

export const updateContactSchema = createContactSchema.partial().omit({ account_id: true })

export const addKycArtifactSchema = z.object({
  account_id: z.string().uuid(),
  artifact_type: z.enum(kycArtifactTypeValues),
  document_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
})

// Finance review action (US-003). Reason required on flag/reject.
export const reviewKycSchema = z
  .object({
    account_id: z.string().uuid(),
    decision: z.enum(['approved', 'flagged', 'rejected']),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.decision === 'approved' || (v.notes !== undefined && v.notes.trim().length > 0),
    { message: 'Notes are required when flagging or rejecting an account', path: ['notes'] }
  )

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
export type CreateContactInput = z.infer<typeof createContactSchema>
export type UpdateContactInput = z.infer<typeof updateContactSchema>
export type AddKycArtifactInput = z.infer<typeof addKycArtifactSchema>
export type ReviewKycInput = z.infer<typeof reviewKycSchema>
