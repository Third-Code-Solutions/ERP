import { z } from 'zod'

/** Empty command: the opportunity path and actor are authoritative inputs. */
export const opportunityProjectConversionCommandSchema = z
  .object({})
  .strict()

export const opportunityProjectConversionResultSchema = z.object({
  ok: z.literal(true),
  opportunityId: z.string().guid(),
  projectId: z.string().guid(),
  checklistId: z.string().guid(),
  tenantId: z.string().guid(),
  createdProject: z.boolean(),
})

export type OpportunityProjectConversionCommand = z.infer<
  typeof opportunityProjectConversionCommandSchema
>
export type OpportunityProjectConversionResult = z.infer<
  typeof opportunityProjectConversionResultSchema
>
