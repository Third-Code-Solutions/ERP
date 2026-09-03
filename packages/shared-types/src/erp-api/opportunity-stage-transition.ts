import { z } from 'zod'
import { opportunityStageValues } from '../opportunities'

const safeNonNegativeCentsSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
const safeSignedCentsSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)

/** Strict command for an authorized opportunity stage transition. */
export const opportunityStageTransitionCommandSchema = z
  .object({
    newStage: z.enum(opportunityStageValues),
    reason: z.string().trim().max(1000).optional(),
    tcvCents: safeNonNegativeCentsSchema.optional(),
    gpCents: safeSignedCentsSchema.optional(),
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
