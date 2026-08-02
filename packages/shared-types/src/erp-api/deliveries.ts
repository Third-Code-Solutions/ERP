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

export const deliveryInspectionCompleteCommandSchema = z
  .object({
    result: z.enum(['pass', 'fail', 'partial_pass']),
    defectNotes: z.string().trim().max(4_000).nullable().optional(),
    acceptanceNotes: z.string().trim().max(4_000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.result === 'fail' && !value.defectNotes?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defectNotes'],
        message: 'Defect notes are required when an inspection fails',
      })
    }
  })

export const deliveryInspectionCompleteResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    action: z.literal('complete_inspection'),
    fromStatus: z.literal('inspecting'),
    inspectionResult: z.enum(['pass', 'fail', 'partial_pass']),
    status: z.enum(['accepted', 'rejected']),
    completedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type DeliveryInspectionCompleteCommand = z.infer<
  typeof deliveryInspectionCompleteCommandSchema
>
export type DeliveryInspectionCompleteResult = z.infer<
  typeof deliveryInspectionCompleteResultSchema
>
