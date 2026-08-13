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
    priceHistoryId: z.string().uuid(),
  })
  .strict()

export const awardRfqQuoteCommandSchema = z.object({}).strict()

export const rfqAwardResultSchema = z
  .object({
    rfqId: z.string().uuid(),
    quoteId: z.string().uuid(),
    tenantId: z.string().uuid(),
    priceHistoryId: z.string().uuid(),
    awarded: z.literal(true),
  })
  .strict()

export const completeRfqCommandSchema = z.object({}).strict()

export const cancelRfqCommandSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict()

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
export type AwardRfqQuoteCommand = z.infer<
  typeof awardRfqQuoteCommandSchema
>
export type RfqAwardResult = z.infer<typeof rfqAwardResultSchema>
export type CompleteRfqCommand = z.infer<
  typeof completeRfqCommandSchema
>
export type CancelRfqCommand = z.infer<
  typeof cancelRfqCommandSchema
>
export type RfqTransitionResult = z.infer<
  typeof rfqTransitionResultSchema
>
