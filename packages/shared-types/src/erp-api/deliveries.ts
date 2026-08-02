import { z } from 'zod'

export const deliveryReceiptCommandSchema = z
  .object({
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()

export const deliveryReceiptResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    action: z.literal('record_receipt'),
    fromStatus: z.enum(['scheduled', 'in_transit']),
    status: z.literal('received'),
  })
  .strict()

export type DeliveryReceiptCommand = z.infer<
  typeof deliveryReceiptCommandSchema
>
export type DeliveryReceiptResult = z.infer<
  typeof deliveryReceiptResultSchema
>
