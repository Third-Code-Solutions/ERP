import { z } from 'zod'

export interface ParsedBomLocation {
  locationName: string
  itemDescription: string
}

export const bomLocationReviewResolutionSchema = z.object({
  reviewId: z.string().uuid(),
  projectId: z.string().uuid(),
  locationId: z.string().uuid(),
})
export type BomLocationReviewResolution = z.infer<typeof bomLocationReviewResolutionSchema>

export const projectLocationCreateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
})
export type ProjectLocationCreate = z.infer<typeof projectLocationCreateSchema>

export const bomLineLocationUpdateSchema = z.object({
  lineItemId: z.string().uuid(),
  projectId: z.string().uuid(),
  locationId: z.string().uuid().nullable(),
})
export type BomLineLocationUpdate = z.infer<typeof bomLineLocationUpdateSchema>

// The separator is deliberately limited to the common room-prefix forms.
// Descriptions that do not match stay in the review queue.
const LOCATION_PREFIX_RE = /^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/u

export function parseBomLocationPrefix(
  description: string | null | undefined,
): ParsedBomLocation | null {
  const original = description?.trim() ?? ''
  if (!original) return null

  const match = LOCATION_PREFIX_RE.exec(original)
  if (!match) return null

  const locationName = match[1]?.trim() ?? ''
  const itemDescription = match[2]?.trim() ?? ''
  if (!locationName || !itemDescription) return null

  return { locationName, itemDescription }
}
