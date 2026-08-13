import { z } from 'zod'

export const bomLineItemKindValues = ['work_item', 'material_line'] as const
export const bomLineItemKindSchema = z.enum(bomLineItemKindValues)
export type BomLineItemKind = typeof bomLineItemKindValues[number]

export const bomLineItemClassificationStatusValues = ['classified', 'review'] as const
export const bomLineItemClassificationStatusSchema = z.enum(
  bomLineItemClassificationStatusValues,
)
export type BomLineItemClassificationStatus =
  typeof bomLineItemClassificationStatusValues[number]

export const bomLineItemUnitRateSourceValues = ['dupa', 'manual', 'client_boq'] as const
export const bomLineItemUnitRateSourceSchema = z.enum(bomLineItemUnitRateSourceValues)
export type BomLineItemUnitRateSource = typeof bomLineItemUnitRateSourceValues[number]

export const bomGrainReviewResolutionSchema = z.object({
  reviewId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: bomLineItemKindSchema,
  parentLineItemId: z.string().uuid().nullable(),
})
export type BomGrainReviewResolution = z.infer<typeof bomGrainReviewResolutionSchema>

export interface BomLineItemClassification {
  kind: BomLineItemKind | null
  status: BomLineItemClassificationStatus
  normalizedUnit: string | null
  reason: string | null
}

const WORK_ITEM_UNITS = new Set(['sqm', 'cu.m', 'm2', 'lm', 'lot'])
const MATERIAL_LINE_UNITS = new Set(['pc', 'pcs', 'kg', 'set', 'liters'])

function normalizeUnit(unit: string | null | undefined): string | null {
  const normalized = unit?.trim().toLowerCase().replace(/\s+/g, '') ?? ''
  return normalized || null
}

/**
 * Classifies only the UOMs explicitly approved by the PRD. Unknown units stay
 * in review; this function never guesses a hierarchy or creates a parent link.
 */
export function classifyBomLineKind(unit: string | null | undefined): BomLineItemClassification {
  const normalizedUnit = normalizeUnit(unit)
  if (normalizedUnit && WORK_ITEM_UNITS.has(normalizedUnit)) {
    return {
      kind: 'work_item',
      status: 'classified',
      normalizedUnit,
      reason: null,
    }
  }

  if (normalizedUnit && MATERIAL_LINE_UNITS.has(normalizedUnit)) {
    return {
      kind: 'material_line',
      status: 'review',
      normalizedUnit,
      reason: 'Material lines require an explicit parent work item.',
    }
  }

  return {
    kind: null,
    status: 'review',
    normalizedUnit,
    reason: 'UOM is not in the approved grain classification list.',
  }
}
