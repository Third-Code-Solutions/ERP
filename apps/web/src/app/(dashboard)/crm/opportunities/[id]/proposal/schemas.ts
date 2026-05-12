import { z } from 'zod'

// Shared schemas for the M2 Proposal flow. Lives in its own non-action
// file so it can be imported by both server actions and form pages —
// Next.js 'use server' modules can only export async functions, never
// objects like Zod schemas.

// Form-aligned 3-value enum. (Future expansion could add 'unknown' but
// the form UI only offers yes/partial/no today.)
const ASBUILT_VALUES = ['yes', 'partial', 'no'] as const

// PPRF payload Zod shape. Required fields per REFACTOR.md US-006 #2.
export const pprfPayloadSchema = z.object({
  site_address: z.string().min(2).max(500),
  floor_area_sqm: z.coerce.number().positive().max(1_000_000),
  landlord_contact: z.string().min(2).max(255),
  as_built_available: z.enum(ASBUILT_VALUES),
  // Free-form trailing notes — captures everything else we haven't
  // canonicalised into a column yet.
  scope_notes: z.string().max(20_000).optional().default(''),
  project_type: z.string().max(255).optional().default(''),
  expected_start_date: z.string().max(64).optional().default(''),
  budget_range: z.string().max(255).optional().default(''),
})

export type PprfPayload = z.infer<typeof pprfPayloadSchema>

export const submitPprfSchema = z
  .object({ opportunity_id: z.string().uuid() })
  .merge(pprfPayloadSchema)

export const ASBUILT_OPTIONS = ASBUILT_VALUES
