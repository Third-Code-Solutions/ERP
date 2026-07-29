import { z } from 'zod'

export const logRfqQuoteCommandSchema = z
  .object({
    submissionId: z.string().uuid(),
    bomLineItemId: z.string().uuid(),
    vendorId: z.string().uuid(),
    unitPriceCents: z.number().int().safe().nonnegative(),
    leadTimeDays: z.number().int().nonnegative().max(3_650).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict()

export const rfqQuoteResultSchema = z
  .object({
    quoteId: z.string().uuid(),
    created: z.boolean(),
    statusChanged: z.boolean(),
  })
  .strict()

export const transitionRfqCommandSchema = z.discriminatedUnion(
  'command',
  [
    z
      .object({
        command: z.literal('complete'),
      })
      .strict(),
    z
      .object({
        command: z.literal('cancel'),
        reason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  ]
)

export const rfqTransitionResultSchema = z
  .object({
    rfqId: z.string().uuid(),
    tenantId: z.string().uuid(),
    transitioned: z.literal(true),
  })
  .strict()

export type LogRfqQuoteCommand = z.infer<
  typeof logRfqQuoteCommandSchema
>
export type RfqQuoteResult = z.infer<typeof rfqQuoteResultSchema>
export type TransitionRfqCommand = z.infer<
  typeof transitionRfqCommandSchema
>
export type RfqTransitionResult = z.infer<
  typeof rfqTransitionResultSchema
>
