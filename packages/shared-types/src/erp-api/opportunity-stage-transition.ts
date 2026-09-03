import { z } from 'zod'
import { opportunityStageValues } from '../opportunities'
import {
  safeNonNegativeCentavosStringSchema,
  safeSignedCentavosStringSchema,
} from './opportunities'

/** Strict command for an authorized opportunity stage transition. */
export const opportunityStageTransitionCommandSchema = z
  .object({
    newStage: z.enum(opportunityStageValues),
    reason: z.string().trim().max(1000).optional(),
    tcvCents: safeNonNegativeCentavosStringSchema.optional(),
    gpCents: safeSignedCentavosStringSchema.optional(),
    closingDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const opportunityStageTransitionResultSchema = z.object({
  ok: z.literal(true),
  opportunityId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fromStage: z.enum(opportunityStageValues),
  toStage: z.enum(opportunityStageValues),
  projectId: z.string().uuid().nullable(),
  checklistId: z.string().uuid().nullable(),
  convertedToProject: z.boolean(),
}).strict()

export type OpportunityStageTransitionCommand = z.infer<
  typeof opportunityStageTransitionCommandSchema
>
export type OpportunityStageTransitionResult = z.infer<
  typeof opportunityStageTransitionResultSchema
>
