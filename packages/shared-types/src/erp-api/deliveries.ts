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

export const deliveryStartSitePreparationCommandSchema = z
  .object({})
  .strict()

export const deliveryStartSitePreparationResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    action: z.literal('start_site_preparation'),
    fromStatus: z.literal('scheduled'),
    status: z.literal('site_preparing'),
  })
  .strict()

export type DeliveryStartSitePreparationCommand = z.infer<
  typeof deliveryStartSitePreparationCommandSchema
>
export type DeliveryStartSitePreparationResult = z.infer<
  typeof deliveryStartSitePreparationResultSchema
>

export const deliveryCompleteSitePreparationCommandSchema = z
  .object({
    notes: z.string().trim().max(4_000).nullable().optional(),
  })
  .strict()

export const deliveryCompleteSitePreparationResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    action: z.literal('complete_site_preparation'),
    fromStatus: z.literal('site_preparing'),
    status: z.literal('site_ready'),
    sitePreparedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type DeliveryCompleteSitePreparationCommand = z.infer<
  typeof deliveryCompleteSitePreparationCommandSchema
>
export type DeliveryCompleteSitePreparationResult = z.infer<
  typeof deliveryCompleteSitePreparationResultSchema
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

export const deliveryCancelCommandSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'Cancellation reason is required')
      .max(4_000),
  })
  .strict()

export const deliveryCancelResultSchema = z
  .object({
    deliveryScheduleId: z.string().uuid(),
    tenantId: z.string().uuid(),
    action: z.literal('cancel_delivery'),
    fromStatus: z.enum([
      'scheduled',
      'site_preparing',
      'site_ready',
      'in_transit',
      'received',
      'inspecting',
    ]),
    status: z.literal('cancelled'),
    cancellationReason: z.string().trim().min(1).max(4_000),
    cancelledAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type DeliveryCancelCommand = z.infer<
  typeof deliveryCancelCommandSchema
>
export type DeliveryCancelResult = z.infer<typeof deliveryCancelResultSchema>
