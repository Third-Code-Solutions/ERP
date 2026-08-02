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

export const deliveryStartInspectionCommandSchema = z
  .object({})
  .strict()

export const deliveryStartInspectionResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    action: z.literal('start_inspection'),
    fromStatus: z.literal('received'),
    status: z.literal('inspecting'),
  })
  .strict()

export type DeliveryStartInspectionCommand = z.infer<
  typeof deliveryStartInspectionCommandSchema
>
export type DeliveryStartInspectionResult = z.infer<
  typeof deliveryStartInspectionResultSchema
>
