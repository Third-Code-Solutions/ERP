import { z } from 'zod'

/** Empty command: the opportunity path and actor are authoritative inputs. */
export const opportunityProjectConversionCommandSchema = z
  .object({})
  .strict()

export const opportunityProjectConversionResultSchema = z.object({
  ok: z.literal(true),
  opportunityId: z.string().uuid(),
  projectId: z.string().uuid(),
  checklistId: z.string().uuid(),
  tenantId: z.string().uuid(),
  createdProject: z.boolean(),
})

export type OpportunityProjectConversionCommand = z.infer<
  typeof opportunityProjectConversionCommandSchema
>
export type OpportunityProjectConversionResult = z.infer<
  typeof opportunityProjectConversionResultSchema
>
